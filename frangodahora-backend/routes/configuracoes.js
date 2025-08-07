const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/:chave', (req, res) => {
  const { chave } = req.params;
  db.get('SELECT valor FROM configuracoes WHERE chave = ?', [chave], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Configuração não encontrada.' });
    res.json(row);
  });
});

router.put('/:chave', (req, res) => {
  const { chave } = req.params;
  const { valor } = req.body;
  if (valor === undefined) return res.status(400).json({ error: 'O campo "valor" é obrigatório.' });
  db.run('UPDATE configuracoes SET valor = ? WHERE chave = ?', [valor, chave], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) {
        db.run('INSERT INTO configuracoes (chave, valor) VALUES (?, ?)', [chave, valor], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ message: 'Configuração criada com sucesso.' });
        });
    } else {
        res.json({ message: 'Configuração atualizada com sucesso.' });
    }
  });
});

module.exports = router;
