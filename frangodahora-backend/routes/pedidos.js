const express = require('express');
const router = express.Router();
const db = require('../db');

// Rota GET (Listar com filtro de data)
router.get('/', (req, res) => {
  const { data } = req.query;
  let dateFilter = "date(p.horario_pedido, 'localtime') = date('now', 'localtime')";
  let params = [];
  if (data) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return res.status(400).json({ error: 'Formato de data inválido. Use AAAA-MM-DD.' });
    }
    dateFilter = "date(p.horario_pedido, 'localtime') = ?";
    params.push(data);
  }
  const sql = `
    SELECT p.*, m.nome as motoqueiro_nome 
    FROM pedidos p
    LEFT JOIN motoqueiros m ON p.motoqueiro_id = m.id
    WHERE ${dateFilter}
    ORDER BY
      CASE p.status
        WHEN 'Pendente' THEN 1
        WHEN 'Em Rota' THEN 2
        WHEN 'Entregue' THEN 3
        WHEN 'Cancelado' THEN 4
        ELSE 5
      END,
      p.rota_ordem, p.horario_pedido DESC
  `;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Rota PUT para ordenar a rota
router.put('/ordenar-rota', (req, res) => {
    const { ordem } = req.body;
    if (!Array.isArray(ordem)) {
        return res.status(400).json({ error: 'O corpo da requisição deve conter um array "ordem".' });
    }
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare('UPDATE pedidos SET rota_ordem = ? WHERE id = ?');
        ordem.forEach((pedidoId, index) => { stmt.run(index, pedidoId); });
        stmt.finalize((finalizeErr) => {
            if (finalizeErr) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Erro ao finalizar a atualização da rota: ' + finalizeErr.message });
            }
            db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Erro ao salvar a transação da rota: ' + commitErr.message });
                }
                res.json({ message: 'Rota atualizada com sucesso!' });
            });
        });
    });
});

// Rota GET (Buscar um pedido)
router.get('/:id', (req, res) => {
    db.get('SELECT * FROM pedidos WHERE id = ?', [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Pedido não encontrado' });
        res.json(row);
    });
});

// Rota POST (Criar)
router.post('/', (req, res) => {
  const { cliente_nome, cliente_endereco, cliente_bairro, cliente_referencia, cliente_telefone, quantidade_frangos, preco_total, forma_pagamento, canal_venda, picado, meio_frango, taxa_entrega, observacao } = req.body;
  
  const totalFrangosPedido = (quantidade_frangos || 0) + (meio_frango ? 0.5 : 0);

  if (totalFrangosPedido <= 0) {
    return res.status(400).json({ error: 'O pedido deve ter pelo menos meio frango.' });
  }
  if (!canal_venda) {
    return res.status(400).json({ error: 'Canal de Venda é obrigatório.' });
  }

  const localDateQuery = "date('now', 'localtime')";
  Promise.all([
      new Promise((resolve, reject) => { 
          const sql = `SELECT quantidade_inicial FROM estoque WHERE data = (${localDateQuery})`;
          db.get(sql, [], (err, row) => { 
              if (err) return reject(err); 
              resolve(row ? row.quantidade_inicial : 0); 
          }); 
      }),
      new Promise((resolve, reject) => { 
          const sql = `SELECT SUM(quantidade_frangos + (meio_frango * 0.5)) AS total_vendido FROM pedidos WHERE status != 'Cancelado' AND date(horario_pedido, 'localtime') = (${localDateQuery})`;
          db.get(sql, [], (err, row) => { 
              if (err) return reject(err); 
              resolve(row ? row.total_vendido : 0); 
          }); 
      })
  ]).then(([estoqueInicial, totalVendido]) => {
      const estoqueAtual = estoqueInicial - (totalVendido || 0);
      if (estoqueAtual < totalFrangosPedido) {
          return res.status(400).json({ error: `Estoque insuficiente! Apenas ${estoqueAtual} frangos disponíveis.` });
      }
      const sqlPedido = `INSERT INTO pedidos (cliente_nome, cliente_endereco, cliente_bairro, cliente_referencia, cliente_telefone, quantidade_frangos, preco_total, forma_pagamento, canal_venda, picado, meio_frango, taxa_entrega, observacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = [cliente_nome, cliente_endereco, cliente_bairro, cliente_referencia, cliente_telefone, quantidade_frangos, preco_total, forma_pagamento, canal_venda, picado ? 1 : 0, meio_frango ? 1 : 0, taxa_entrega || 0, observacao];
      db.run(sqlPedido, params, function(err) {
        if (err) return res.status(500).json({ error: 'Erro ao criar pedido: ' + err.message });
        res.status(201).json({ message: 'Pedido criado com sucesso!', pedidoId: this.lastID });
      });
  }).catch(err => {
      res.status(500).json({ error: 'Erro ao verificar estoque: ' + err.message });
  });
});

// Rota PUT (Editar)
router.put('/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM pedidos WHERE id = ?', [id], (err, pedidoExistente) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!pedidoExistente) return res.status(404).json({ error: 'Pedido não encontrado.' });
        if (pedidoExistente.status === 'Cancelado') {
            return res.status(403).json({ error: 'Não é possível editar um pedido cancelado.' });
        }
        const dadosParaAtualizar = {
            cliente_nome: req.body.cliente_nome !== undefined ? req.body.cliente_nome : pedidoExistente.cliente_nome,
            cliente_endereco: req.body.cliente_endereco !== undefined ? req.body.cliente_endereco : pedidoExistente.cliente_endereco,
            cliente_bairro: req.body.cliente_bairro !== undefined ? req.body.cliente_bairro : pedidoExistente.cliente_bairro,
            cliente_referencia: req.body.cliente_referencia !== undefined ? req.body.cliente_referencia : pedidoExistente.cliente_referencia,
            cliente_telefone: req.body.cliente_telefone !== undefined ? req.body.cliente_telefone : pedidoExistente.cliente_telefone,
            forma_pagamento: req.body.forma_pagamento !== undefined ? req.body.forma_pagamento : pedidoExistente.forma_pagamento,
            canal_venda: req.body.canal_venda !== undefined ? req.body.canal_venda : pedidoExistente.canal_venda,
            status: req.body.status !== undefined ? req.body.status : pedidoExistente.status,
            quantidade_frangos: !isNaN(parseInt(req.body.quantidade_frangos)) ? parseInt(req.body.quantidade_frangos) : pedidoExistente.quantidade_frangos,
            preco_total: !isNaN(parseFloat(req.body.preco_total)) ? parseFloat(req.body.preco_total) : pedidoExistente.preco_total,
            picado: req.body.picado !== undefined ? (req.body.picado ? 1 : 0) : pedidoExistente.picado,
            meio_frango: req.body.meio_frango !== undefined ? (req.body.meio_frango ? 1 : 0) : pedidoExistente.meio_frango,
            taxa_entrega: req.body.taxa_entrega !== undefined ? parseFloat(req.body.taxa_entrega) : pedidoExistente.taxa_entrega,
            observacao: req.body.observacao !== undefined ? req.body.observacao : pedidoExistente.observacao,
        };
        const sql = `UPDATE pedidos SET cliente_nome = ?, cliente_endereco = ?, cliente_bairro = ?, cliente_referencia = ?, cliente_telefone = ?, quantidade_frangos = ?, preco_total = ?, forma_pagamento = ?, canal_venda = ?, status = ?, picado = ?, meio_frango = ?, taxa_entrega = ?, observacao = ? WHERE id = ?`;
        const params = [
            dadosParaAtualizar.cliente_nome, dadosParaAtualizar.cliente_endereco, dadosParaAtualizar.cliente_bairro, dadosParaAtualizar.cliente_referencia,
            dadosParaAtualizar.cliente_telefone, dadosParaAtualizar.quantidade_frangos, dadosParaAtualizar.preco_total,
            dadosParaAtualizar.forma_pagamento, dadosParaAtualizar.canal_venda, dadosParaAtualizar.status,
            dadosParaAtualizar.picado, dadosParaAtualizar.meio_frango, dadosParaAtualizar.taxa_entrega, dadosParaAtualizar.observacao,
            id
        ];
        db.run(sql, params, function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Pedido atualizado com sucesso!' });
        });
    });
});

// Rota PUT (Cancelar)
router.put('/:id/cancelar', (req, res) => {
    const { id } = req.params;
    db.get('SELECT status FROM pedidos WHERE id = ?', [id], (err, pedido) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
        if (pedido.status === 'Cancelado') return res.status(400).json({ error: 'Este pedido já foi cancelado.' });
        const sqlPedido = `UPDATE pedidos SET status = 'Cancelado' WHERE id = ?`;
        db.run(sqlPedido, [id], function(err) {
            if (err) return res.status(500).json({ error: 'Erro ao cancelar o pedido.' });
            res.json({ message: 'Pedido cancelado. O estoque foi ajustado automaticamente.' });
        });
    });
});

// Rota PUT para marcar pedido como "Retirado"
router.put('/:id/retirou', (req, res) => {
    const { id } = req.params;
    db.run("UPDATE pedidos SET status = 'Entregue' WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: 'Erro ao atualizar status do pedido.' });
        if (this.changes === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });
        res.json({ message: 'Pedido marcado como retirado!' });
    });
});

// Rota PUT (Atribuir / Reatribuir) - CORRIGIDA
router.put('/:id/atribuir', (req, res) => {
    const pedidoId = req.params.id;
    const { motoqueiroId } = req.body;
    if (!motoqueiroId) {
        return res.status(400).json({ error: 'O ID do motoqueiro é obrigatório.' });
    }
    
    // A nova lógica é muito mais simples: apenas atualiza o pedido.
    // A rota_ordem é definida com o tempo atual para que novos pedidos fiquem no final da rota por padrão.
    const sql = `UPDATE pedidos SET motoqueiro_id = ?, status = 'Em Rota', rota_ordem = ? WHERE id = ?`;
    db.run(sql, [motoqueiroId, Date.now(), pedidoId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Erro ao atribuir pedido ao motoqueiro.' });
        }
        res.json({ message: 'Pedido atribuído com sucesso!' });
    });
});

// ROTA: Marcar um pedido de entrega como "Entregue"
router.put('/:id/entregar', (req, res) => {
    const pedidoId = req.params.id;
    db.get('SELECT motoqueiro_id FROM pedidos WHERE id = ?', [pedidoId], (err, pedido) => {
        if (err) { return res.status(500).json({ error: 'Erro ao buscar o pedido.' }); }
        if (!pedido) { return res.status(404).json({ error: 'Pedido não encontrado.' }); }
        if (!pedido.motoqueiro_id) { return res.status(400).json({ error: 'Este pedido é uma retirada e não pode ser entregue por esta rota.' }); }
        
        const sqlPedido = `UPDATE pedidos SET status = 'Entregue' WHERE id = ?`;
        db.run(sqlPedido, [pedidoId], function(err) {
            if (err) { return res.status(500).json({ error: 'Erro ao atualizar o status do pedido.' }); }
            res.json({ message: 'Pedido entregue!' });
        });
    });
});

module.exports = router;
