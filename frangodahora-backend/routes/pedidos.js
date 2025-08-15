const express = require('express');
const router = express.Router();
const db = require('../db');

// Rota para criar um novo pedido
router.post('/', (req, res) => {
    const {
        cliente_nome, cliente_endereco, cliente_bairro, cliente_referencia, cliente_telefone,
        quantidade_frangos, meio_frango, taxa_entrega, preco_total, forma_pagamento,
        canal_venda, picado, observacao, tempo_previsto
    } = req.body;

    const inserirPedido = () => {
        const sql = `INSERT INTO pedidos (cliente_nome, cliente_endereco, cliente_bairro, cliente_referencia, cliente_telefone, quantidade_frangos, meio_frango, taxa_entrega, preco_total, forma_pagamento, canal_venda, status, horario_pedido, picado, observacao, tempo_previsto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendente', datetime('now', 'localtime'), ?, ?, ?)`;
        const params = [cliente_nome, cliente_endereco, cliente_bairro, cliente_referencia, cliente_telefone, quantidade_frangos, meio_frango, taxa_entrega, preco_total, forma_pagamento, canal_venda, picado, observacao, tempo_previsto];
        
        db.run(sql, params, function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ message: 'Pedido criado com sucesso!', pedidoId: this.lastID });
        });
    };

    if (cliente_endereco !== 'Retirada' && cliente_bairro) {
        db.get('SELECT * FROM taxas_bairro WHERE bairro = ?', [cliente_bairro], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) {
                db.run('INSERT INTO taxas_bairro (bairro, taxa) VALUES (?, ?)', [cliente_bairro, taxa_entrega], (err) => {
                    if (err) console.error("Erro ao auto-cadastrar bairro:", err.message);
                    inserirPedido();
                });
            } else {
                inserirPedido();
            }
        });
    } else {
        inserirPedido();
    }
});

// Rota para obter todos os pedidos de uma data específica
router.get('/', (req, res) => {
    const data = req.query.data || new Date().toISOString().slice(0, 10);
    const sql = `
        SELECT p.*, m.nome as motoqueiro_nome 
        FROM pedidos p 
        LEFT JOIN motoqueiros m ON p.motoqueiro_id = m.id
        WHERE date(p.horario_pedido) = ?
        ORDER BY 
            CASE p.status
                WHEN 'Pendente' THEN 1
                WHEN 'Em Rota' THEN 2
                WHEN 'Entregue' THEN 3
                WHEN 'Cancelado' THEN 4
                ELSE 5
            END,
            p.id DESC
    `;
    db.all(sql, [data], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Rota para obter um pedido específico
router.get('/:id', (req, res) => {
    const { id } = req.params;
    db.get("SELECT * FROM pedidos WHERE id = ?", [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Pedido não encontrado." });
        res.json(row);
    });
});

// Rota para atualizar um pedido
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const {
        cliente_nome, cliente_endereco, cliente_bairro, cliente_referencia, cliente_telefone,
        quantidade_frangos, meio_frango, taxa_entrega, preco_total, forma_pagamento,
        canal_venda, picado, observacao, tempo_previsto
    } = req.body;

    const sql = `UPDATE pedidos SET cliente_nome = ?, cliente_endereco = ?, cliente_bairro = ?, cliente_referencia = ?, cliente_telefone = ?, quantidade_frangos = ?, meio_frango = ?, taxa_entrega = ?, preco_total = ?, forma_pagamento = ?, canal_venda = ?, picado = ?, observacao = ?, tempo_previsto = ? WHERE id = ?`;
    const params = [cliente_nome, cliente_endereco, cliente_bairro, cliente_referencia, cliente_telefone, quantidade_frangos, meio_frango, taxa_entrega, preco_total, forma_pagamento, canal_venda, picado, observacao, tempo_previsto, id];

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Pedido atualizado com sucesso!', changes: this.changes });
    });
});

// Rota para atribuir um motoqueiro
router.put('/:id/atribuir', (req, res) => {
    const pedidoIdNum = parseInt(req.params.id, 10);
    const motoqueiroIdNum = parseInt(req.body.motoqueiroId, 10);

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        const findMaxOrderSql = `
            SELECT MAX(rota_ordem) as max_ordem 
            FROM pedidos 
            WHERE motoqueiro_id = ? AND date(horario_pedido) = date('now', 'localtime')
        `;

        db.get(findMaxOrderSql, [motoqueiroIdNum], (err, row) => {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: "Erro ao buscar a ordem da rota: " + err.message });
            }

            const newOrder = (row && row.max_ordem != null) ? row.max_ordem + 1 : 1;

            const updatePedidoSql = `
                UPDATE pedidos 
                SET motoqueiro_id = ?, status = 'Em Rota', rota_ordem = ? 
                WHERE id = ?
            `;
            db.run(updatePedidoSql, [motoqueiroIdNum, newOrder, pedidoIdNum], function(err) {
                if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: "Erro ao atribuir o pedido: " + err.message });
                }

                db.run("COMMIT", (commitErr) => {
                    if (commitErr) {
                        return res.status(500).json({ error: "Erro ao finalizar a transação: " + commitErr.message });
                    }
                    res.json({ message: 'Motoqueiro atribuído com sucesso!' });
                });
            });
        });
    });
});

// Rota para marcar como entregue
router.put('/:id/entregar', (req, res) => {
    db.run("UPDATE pedidos SET status = 'Entregue' WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Pedido marcado como entregue.' });
    });
});

// Rota para marcar como retirado
router.put('/:id/retirou', (req, res) => {
    db.run("UPDATE pedidos SET status = 'Entregue' WHERE id = ? AND cliente_endereco = 'Retirada'", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Pedido marcado como retirado.' });
    });
});

// Rota para cancelar pedido
router.put('/:id/cancelar', (req, res) => {
    db.run("UPDATE pedidos SET status = 'Cancelado', motoqueiro_id = NULL, rota_ordem = 0 WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Pedido cancelado.' });
    });
});

// Rota para ordenar a rota de entrega (LÓGICA REFEITA E COM LOGS)
router.put('/ordenar-rota', (req, res) => {
    console.log("--- [DEBUG] ROTA /ordenar-rota ATINGIDA ---");
    const { ordem, motoqueiroId } = req.body;
    console.log(`[DEBUG] DADOS RECEBIDOS: motoqueiroId=${motoqueiroId}, ordem=${JSON.stringify(ordem)}`);

    if (!ordem || !Array.isArray(ordem) || !motoqueiroId) {
        console.error("[DEBUG] ERRO: Dados inválidos recebidos.");
        return res.status(400).json({ error: 'Dados inválidos. É necessário fornecer a ordem e o ID do motoqueiro.' });
    }

    const motoqueiroIdNum = parseInt(motoqueiroId, 10);

    db.serialize(() => {
        db.run("BEGIN TRANSACTION", (err) => {
            if (err) {
                console.error("[DEBUG] ERRO ao iniciar transação:", err.message);
                return res.status(500).json({ error: err.message });
            }
            console.log("[DEBUG] Transação iniciada.");

            const promises = ordem.map((pedidoId, index) => {
                return new Promise((resolve, reject) => {
                    const pedidoIdNum = parseInt(pedidoId, 10);
                    const newOrder = index + 1;
                    const sql = "UPDATE pedidos SET rota_ordem = ? WHERE id = ? AND motoqueiro_id = ?";
                    
                    db.run(sql, [newOrder, pedidoIdNum, motoqueiroIdNum], function(err) {
                        if (err) {
                            console.error(`[DEBUG] ERRO no DB ao atualizar pedido ${pedidoIdNum}:`, err.message);
                            return reject(err);
                        }
                        if (this.changes === 0) {
                            console.warn(`[DEBUG] ATENÇÃO: Nenhuma linha afetada para o pedido ${pedidoIdNum}. O pedido pertence a este motoqueiro?`);
                        } else {
                            console.log(`[DEBUG] Pedido ${pedidoIdNum} atualizado para ordem ${newOrder}.`);
                        }
                        resolve();
                    });
                });
            });

            Promise.all(promises)
                .then(() => {
                    db.run("COMMIT", (commitErr) => {
                        if (commitErr) {
                            console.error("[DEBUG] ERRO ao commitar:", commitErr.message);
                            return res.status(500).json({ error: commitErr.message });
                        }
                        console.log("[DEBUG] COMMIT BEM-SUCEDIDO. Rota salva.");
                        res.json({ message: 'Rota de entrega ordenada com sucesso.' });
                    });
                })
                .catch(error => {
                    db.run("ROLLBACK");
                    console.error("[DEBUG] ERRO GERAL, executando ROLLBACK:", error.message);
                    res.status(500).json({ error: "Erro ao atualizar a rota: " + error.message });
                });
        });
    });
});


module.exports = router;
