const express = require('express');
const router = express.Router();
const db = require('../db');

// ROTA GET ATUALIZADA para buscar estoque por data
router.get('/', (req, res) => {
    const { data } = req.query;
    // Se uma data é fornecida pelo cliente, usa ela. Senão, usa a data local do servidor.
    const dateToQuery = data || new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    Promise.all([
        new Promise((resolve, reject) => {
            const sql = `SELECT quantidade_inicial FROM estoque WHERE data = ?`;
            db.get(sql, [dateToQuery], (err, row) => {
                if (err) return reject(err);
                resolve(row ? row.quantidade_inicial : 0);
            });
        }),
        new Promise((resolve, reject) => {
            // CORRIGIDO: Removido o 'localtime' para evitar cálculo duplo de fuso horário.
            const sql = `SELECT SUM(quantidade_frangos + (meio_frango * 0.5)) AS total_vendido FROM pedidos WHERE status != 'Cancelado' AND date(horario_pedido) = ?`;
            db.get(sql, [dateToQuery], (err, row) => {
                if (err) return reject(err);
                // Garante que o valor seja 0 se não houver vendas
                resolve(row && row.total_vendido ? row.total_vendido : 0);
            });
        })
    ]).then(([estoqueInicial, totalVendido]) => {
        const estoqueAtual = estoqueInicial - totalVendido;
        res.json({
            quantidade_inicial: estoqueInicial,
            total_vendido: totalVendido,
            quantidade_atual: estoqueAtual
        });
    }).catch(err => {
        res.status(500).json({ error: 'Erro ao buscar dados do estoque: ' + err.message });
    });
});

// ROTA PUT ATUALIZADA para inserir/atualizar estoque por data
router.put('/', (req, res) => {
  const { quantidade, data } = req.body;
  const dateToUpdate = data || new Date().toISOString().slice(0, 10);

  if (quantidade == null || isNaN(quantidade) || quantidade < 0) {
    return res.status(400).json({ error: 'Quantidade inválida.' });
  }
  const sql = `
    INSERT INTO estoque (data, quantidade_inicial) 
    VALUES (?, ?)
    ON CONFLICT(data) DO UPDATE SET
    quantidade_inicial = excluded.quantidade_inicial;
  `;
  db.run(sql, [dateToUpdate, quantidade], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(200).json({ message: 'Estoque do dia atualizado com sucesso!' });
  });
});

module.exports = router;