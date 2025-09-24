const express = require('express');
const router = express.Router();
const { db } = require('../db');

// Rota para obter todos os motoqueiros (mestre)
router.get('/', (req, res) => {
    db.all("SELECT * FROM motoqueiros ORDER BY nome", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Rota para obter detalhes dos motoqueiros ativos em uma data
router.get('/detalhes', (req, res) => {
    const data = req.query.data || new Date().toISOString().slice(0, 10);
    const sql = `
        SELECT 
            m.id, 
            m.nome, 
            od.frangos_na_bag 
        FROM motoqueiros m
        JOIN operacoes_diarias od ON m.id = od.motoqueiro_id
        WHERE od.data = ?
    `;
    db.all(sql, [data], (err, motoqueiros) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (motoqueiros.length === 0) {
            return res.json([]);
        }

        const promises = motoqueiros.map(motoqueiro => {
            return new Promise((resolve, reject) => {
                const pedidosSql = `
                    SELECT * FROM pedidos 
                    WHERE motoqueiro_id = ? AND date(horario_pedido) = ?
                    ORDER BY rota_ordem, id
                `;
                db.all(pedidosSql, [motoqueiro.id, data], (err, pedidos) => {
                    if (err) {
                        return reject(err);
                    }
                    motoqueiro.pedidos_em_rota = pedidos.filter(p => p.status === 'Em Rota');
                    motoqueiro.pedidos_entregues = pedidos.filter(p => p.status === 'Entregue');
                    resolve(motoqueiro);
                });
            });
        });

        Promise.all(promises)
            .then(results => res.json(results))
            .catch(error => res.status(500).json({ error: error.message }));
    });
});

// Rota para iniciar dia ou adicionar/remover frangos (COM VALIDAÇÃO DE ESTOQUE REFINADA)
router.post('/operacao', (req, res) => {
    const { motoqueiro_nome, data, frangos_na_bag } = req.body;
    const frangosParaAdicionar = Number(frangos_na_bag);

    // Se a quantidade for negativa, é uma remoção, não precisa checar estoque.
    if (frangosParaAdicionar <= 0) {
        return processarOperacao();
    }

    // --- LÓGICA DE VALIDAÇÃO DE ESTOQUE REFINADA ---
    const getEstoqueInicial = new Promise((resolve, reject) => {
        db.get("SELECT quantidade_inicial FROM estoque WHERE data = ?", [data], (err, row) => {
            if (err) return reject(err);
            resolve(row ? row.quantidade_inicial : 0);
        });
    });

    const getTotalEmBags = new Promise((resolve, reject) => {
        db.get("SELECT SUM(frangos_na_bag) as total FROM operacoes_diarias WHERE data = ?", [data], (err, row) => {
            if (err) return reject(err);
            resolve(row && row.total ? row.total : 0);
        });
    });
    
    const getTotalParaRetirada = new Promise((resolve, reject) => {
        const sql = `
            SELECT SUM(quantidade_frangos + (meio_frango * 0.5)) AS total 
            FROM pedidos 
            WHERE cliente_endereco = 'Retirada' 
            AND status != 'Cancelado' 
            AND date(horario_pedido) = ?`;
        db.get(sql, [data], (err, row) => {
            if (err) return reject(err);
            resolve(row && row.total ? row.total : 0);
        });
    });

    Promise.all([getEstoqueInicial, getTotalEmBags, getTotalParaRetirada])
        .then(([estoqueInicial, totalJaEmBags, totalParaRetirada]) => {
            const maximoPermitidoEmBags = estoqueInicial - totalParaRetirada;
            const frangosDisponiveisParaAtribuir = maximoPermitidoEmBags - totalJaEmBags;

            if (frangosParaAdicionar > frangosDisponiveisParaAtribuir) {
                return res.status(400).json({
                    error: `Ação bloqueada. Frangos disponíveis para atribuir: ${frangosDisponiveisParaAtribuir.toFixed(1)}.`
                });
            }
            
            processarOperacao();
        })
        .catch(err => {
            res.status(500).json({ error: "Erro ao verificar o estoque: " + err.message });
        });
    
    // --- FUNÇÃO PARA EXECUTAR A OPERAÇÃO NO BANCO ---
    function processarOperacao() {
        db.get("SELECT id FROM motoqueiros WHERE nome = ?", [motoqueiro_nome], (err, motoqueiro) => {
            if (err) return res.status(500).json({ error: err.message });

            const executeDbUpdate = (motoqueiroId) => {
                db.get("SELECT * FROM operacoes_diarias WHERE motoqueiro_id = ? AND data = ?", [motoqueiroId, data], (err, operacao) => {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    if (operacao) {
                        const novaQtd = operacao.frangos_na_bag + frangosParaAdicionar;
                        db.run("UPDATE operacoes_diarias SET frangos_na_bag = ? WHERE id = ?", [novaQtd, operacao.id], function(err) {
                            if (err) return res.status(500).json({ error: err.message });
                            const message = frangosParaAdicionar > 0 ? 'Frangos adicionados com sucesso!' : 'Frangos removidos com sucesso!';
                            res.json({ message });
                        });
                    } else {
                        db.run("INSERT INTO operacoes_diarias (motoqueiro_id, data, frangos_na_bag) VALUES (?, ?, ?)", [motoqueiroId, data, frangosParaAdicionar], function(err) {
                            if (err) return res.status(500).json({ error: err.message });
                            res.status(201).json({ message: 'Dia do motoqueiro iniciado com sucesso!' });
                        });
                    }
                });
            };

            if (motoqueiro) {
                executeDbUpdate(motoqueiro.id);
            } else {
                db.run("INSERT INTO motoqueiros (nome) VALUES (?)", [motoqueiro_nome], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    executeDbUpdate(this.lastID);
                });
            }
        });
    }
});

// Rota para obter motoqueiro por nome (para a tela de entregas)
router.get('/nome/:nome', (req, res) => {
    const sql = `
        SELECT m.id, m.nome, od.frangos_na_bag 
        FROM motoqueiros m
        LEFT JOIN operacoes_diarias od ON m.id = od.motoqueiro_id AND od.data = date('now', 'localtime')
        WHERE m.nome = ?
    `;
    db.get(sql, [req.params.nome], (err, motoqueiro) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!motoqueiro) return res.status(404).json({ error: 'Motoqueiro não encontrado ou não iniciou o dia.' });

        const pedidosSql = `
            SELECT * FROM pedidos 
            WHERE motoqueiro_id = ? AND date(horario_pedido) = date('now', 'localtime') AND (status = 'Em Rota' OR status = 'Entregue')
            ORDER BY 
                CASE status
                    WHEN 'Em Rota' THEN 1
                    WHEN 'Entregue' THEN 2
                END,
                rota_ordem, 
                id
        `;
        db.all(pedidosSql, [motoqueiro.id], (err, pedidos) => {
            if (err) return res.status(500).json({ error: err.message });
            
            motoqueiro.pedidos_em_rota = pedidos.filter(p => p.status === 'Em Rota');
            motoqueiro.pedidos_entregues = pedidos.filter(p => p.status === 'Entregue');
            
            res.json(motoqueiro);
        });
    });
});

// Rota para excluir motoqueiro (mestre)
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM motoqueiros WHERE id = ?", id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Motoqueiro excluído com sucesso.' });
    });
});

module.exports = router;

