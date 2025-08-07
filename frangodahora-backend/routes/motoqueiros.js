const express = require('express');
const router = express.Router();
const db = require('../db');

// Rota GET - Listar todos os motoqueiros da lista MESTRE
router.get('/', (req, res) => {
  db.all('SELECT * FROM motoqueiros ORDER BY nome', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Rota GET - Buscar um motoqueiro e seus pedidos pelo NOME (CORRIGIDO)
router.get('/nome/:nome', (req, res) => {
    const { nome } = req.params;
    const localDateQuery = "date('now', 'localtime')";
    const sql = `
        SELECT 
            m.id as motoqueiro_id, m.nome as motoqueiro_nome,
            p.id as pedido_id, p.status as pedido_status, p.quantidade_frangos, p.meio_frango, p.cliente_nome, p.cliente_endereco, p.cliente_bairro, p.cliente_referencia, p.cliente_telefone, p.preco_total, p.forma_pagamento, p.picado, p.observacao
        FROM motoqueiros m
        JOIN operacoes_diarias od ON m.id = od.motoqueiro_id AND od.data = ${localDateQuery}
        LEFT JOIN pedidos p ON m.id = p.motoqueiro_id AND p.status = 'Em Rota' AND date(p.horario_pedido, 'localtime') = ${localDateQuery}
        WHERE m.nome = ?
        ORDER BY p.rota_ordem;
    `;
    db.all(sql, [nome], (err, rows) => {
        if (err) return res.status(500).json({ error: "Erro de comunicação com o banco de dados: " + err.message });
        if (rows.length === 0) return res.status(404).json({ error: 'Motoqueiro não encontrado ou sem operação iniciada para hoje.' });

        const motoqueiro = {
            id: rows[0].motoqueiro_id,
            nome: rows[0].motoqueiro_nome,
            pedidos_em_rota: []
        };

        rows.forEach(row => {
            if (row.pedido_id) {
                motoqueiro.pedidos_em_rota.push({
                    id: row.pedido_id,
                    quantidade_frangos: row.quantidade_frangos,
                    meio_frango: row.meio_frango,
                    cliente_nome: row.cliente_nome,
                    cliente_endereco: row.cliente_endereco,
                    cliente_bairro: row.cliente_bairro,
                    cliente_referencia: row.cliente_referencia,
                    cliente_telefone: row.cliente_telefone,
                    preco_total: row.preco_total,
                    forma_pagamento: row.forma_pagamento,
                    picado: row.picado,
                    observacao: row.observacao
                });
            }
        });
        
        res.json(motoqueiro);
    });
});


// Rota GET - Busca todos os motoqueiros com detalhes
router.get('/detalhes', (req, res) => {
    const { data } = req.query;
    const dateToQuery = data || new Date().toISOString().slice(0, 10);

    const sql = `
        SELECT 
            m.id as motoqueiro_id, m.nome as motoqueiro_nome,
            od.frangos_na_bag,
            p.id as pedido_id, p.status as pedido_status, p.quantidade_frangos, p.meio_frango, p.cliente_nome, p.cliente_endereco, p.cliente_bairro, p.cliente_referencia, p.cliente_telefone, p.preco_total, p.forma_pagamento, p.picado, p.observacao
        FROM motoqueiros m
        JOIN operacoes_diarias od ON m.id = od.motoqueiro_id AND od.data = ?
        LEFT JOIN pedidos p ON m.id = p.motoqueiro_id AND date(p.horario_pedido, 'localtime') = ?
        ORDER BY m.nome, p.rota_ordem;
    `;
    db.all(sql, [dateToQuery, dateToQuery], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const motoqueiros = {};
        rows.forEach(row => {
            if (!motoqueiros[row.motoqueiro_id]) {
                motoqueiros[row.motoqueiro_id] = { id: row.motoqueiro_id, nome: row.motoqueiro_nome, frangos_na_bag: row.frangos_na_bag, pedidos_em_rota: [], pedidos_entregues: [] };
            }
            if (row.pedido_id) {
                const pedido_info = { id: row.pedido_id, quantidade_frangos: row.quantidade_frangos, meio_frango: row.meio_frango, cliente_nome: row.cliente_nome, cliente_endereco: row.cliente_endereco, cliente_bairro: row.cliente_bairro, cliente_referencia: row.cliente_referencia, cliente_telefone: row.cliente_telefone, preco_total: row.preco_total, forma_pagamento: row.forma_pagamento, picado: row.picado, observacao: row.observacao };
                if (row.pedido_status === 'Em Rota') { motoqueiros[row.motoqueiro_id].pedidos_em_rota.push(pedido_info); } 
                else if (row.pedido_status === 'Entregue') { motoqueiros[row.motoqueiro_id].pedidos_entregues.push(pedido_info); }
            }
        });
        res.json(Object.values(motoqueiros));
    });
});

router.post('/operacao', (req, res) => {
    const { motoqueiro_nome, data, frangos_na_bag } = req.body;
    if (!motoqueiro_nome || !data || frangos_na_bag == null) {
        return res.status(400).json({ error: 'Nome do motoqueiro, data e frangos na bag são obrigatórios.' });
    }
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const findMotoqueiroSql = "SELECT id FROM motoqueiros WHERE nome = ?";
        db.get(findMotoqueiroSql, [motoqueiro_nome], (err, row) => {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: "Erro ao buscar motoqueiro: " + err.message });
            }
            if (row) {
                iniciarOuAtualizarOperacao(row.id, data, frangos_na_bag, res);
            } else {
                const insertMotoqueiroSql = "INSERT INTO motoqueiros (nome) VALUES (?)";
                db.run(insertMotoqueiroSql, [motoqueiro_nome], function(err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: "Erro ao criar novo motoqueiro: " + err.message });
                    }
                    iniciarOuAtualizarOperacao(this.lastID, data, frangos_na_bag, res);
                });
            }
        });
    });
});
function iniciarOuAtualizarOperacao(motoqueiro_id, data, frangos_na_bag, res) {
    const sql = `
        INSERT INTO operacoes_diarias (motoqueiro_id, data, frangos_na_bag) 
        VALUES (?, ?, ?)
        ON CONFLICT(motoqueiro_id, data) DO UPDATE SET
        frangos_na_bag = frangos_na_bag + excluded.frangos_na_bag;
    `;
    db.run(sql, [motoqueiro_id, data, frangos_na_bag], function(err) {
        if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: "Erro ao registrar operação: " + err.message });
        }
        db.run('COMMIT', (commitErr) => {
            if (commitErr) {
                return res.status(500).json({ error: "Erro ao salvar transação: " + commitErr.message });
            }
            res.status(201).json({ message: 'Operação do motoqueiro iniciada/atualizada com sucesso!' });
        });
    });
}
router.delete('/:id', (req, res) => {
  db.run('DELETE FROM motoqueiros WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Motoqueiro não encontrado.' });
    db.run('DELETE FROM operacoes_diarias WHERE motoqueiro_id = ?', [req.params.id]);
    res.json({ message: 'Motoqueiro deletado com sucesso.', deleted: this.changes });
  });
});

module.exports = router;
