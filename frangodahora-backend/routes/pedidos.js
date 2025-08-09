const express = require('express');
const router = express.Router();
const db = require('../db');

// Rota para criar um novo pedido
router.post('/', (req, res) => {
    const {
        cliente_nome, cliente_endereco, cliente_bairro, cliente_referencia, cliente_telefone,
        quantidade_frangos, meio_frango, taxa_entrega, preco_total, forma_pagamento,
        canal_venda, picado, observacao
    } = req.body;

    const inserirPedido = () => {
        const sql = `INSERT INTO pedidos (cliente_nome, cliente_endereco, cliente_bairro, cliente_referencia, cliente_telefone, quantidade_frangos, meio_frango, taxa_entrega, preco_total, forma_pagamento, canal_venda, status, horario_pedido, picado, observacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendente', datetime('now', 'localtime'), ?, ?)`;
        const params = [cliente_nome, cliente_endereco, cliente_bairro, cliente_referencia, cliente_telefone, quantidade_frangos, meio_frango, taxa_entrega, preco_total, forma_pagamento, canal_venda, picado, observacao];
        
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
        ORDER BY p.id DESC
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
        canal_venda, picado, observacao
    } = req.body;

    const sql = `UPDATE pedidos SET cliente_nome = ?, cliente_endereco = ?, cliente_bairro = ?, cliente_referencia = ?, cliente_telefone = ?, quantidade_frangos = ?, meio_frango = ?, taxa_entrega = ?, preco_total = ?, forma_pagamento = ?, canal_venda = ?, picado = ?, observacao = ? WHERE id = ?`;
    const params = [cliente_nome, cliente_endereco, cliente_bairro, cliente_referencia, cliente_telefone, quantidade_frangos, meio_frango, taxa_entrega, preco_total, forma_pagamento, canal_venda, picado, observacao, id];

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Pedido atualizado com sucesso!', changes: this.changes });
    });
});

// Rota para atribuir um motoqueiro
router.put('/:id/atribuir', (req, res) => {
    const { id } = req.params;
    const { motoqueiroId } = req.body;
    db.run("UPDATE pedidos SET motoqueiro_id = ?, status = 'Em Rota' WHERE id = ?", [motoqueiroId, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Motoqueiro atribuído com sucesso!' });
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
    db.run("UPDATE pedidos SET status = 'Cancelado', motoqueiro_id = NULL WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Pedido cancelado.' });
    });
});

// Rota para ordenar a rota de entrega
router.put('/ordenar-rota', (req, res) => {
    const { ordem } = req.body;
    if (!ordem || !Array.isArray(ordem)) {
        return res.status(400).json({ error: 'Formato de dados inválido.' });
    }
    db.serialize(() => {
        const stmt = db.prepare("UPDATE pedidos SET rota_ordem = ? WHERE id = ?");
        ordem.forEach((pedidoId, index) => {
            stmt.run(index + 1, pedidoId);
        });
        stmt.finalize((err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Rota de entrega ordenada com sucesso.' });
        });
    });
});

module.exports = router;
