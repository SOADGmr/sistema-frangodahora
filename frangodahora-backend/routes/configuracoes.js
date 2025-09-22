const express = require('express');
const router = express.Router();
const db = require('../db');

// --- ROTAS PARA TAXAS DE BAIRRO ---

// GET: Obter todas as taxas de bairro
router.get('/taxas', (req, res) => {
    db.all("SELECT * FROM taxas_bairro ORDER BY bairro", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// POST: Adicionar uma nova taxa de bairro
router.post('/taxas', (req, res) => {
    const { bairro, taxa } = req.body;
    if (!bairro || taxa === undefined) {
        return res.status(400).json({ error: "Por favor, forneça o nome do bairro e a taxa." });
    }

    const sql = `INSERT INTO taxas_bairro (bairro, taxa) VALUES (?, ?)`;
    db.run(sql, [bairro, taxa], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.status(201).json({ id: this.lastID, bairro, taxa });
    });
});

// PUT: Atualizar uma taxa de bairro existente
router.put('/taxas/:id', (req, res) => {
    const { id } = req.params;
    const { bairro, taxa } = req.body;
    if (!bairro || taxa === undefined) {
        return res.status(400).json({ error: "Por favor, forneça o nome do bairro e a taxa." });
    }

    const sql = `UPDATE taxas_bairro SET bairro = ?, taxa = ? WHERE id = ?`;
    db.run(sql, [bairro, taxa, id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: "Bairro não encontrado." });
        }
        res.json({ message: 'Taxa do bairro atualizada com sucesso!', changes: this.changes });
    });
});


// DELETE: Excluir uma taxa de bairro
router.delete('/taxas/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM taxas_bairro WHERE id = ?`, id, function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: "Bairro não encontrado." });
        }
        res.json({ message: 'Bairro excluído com sucesso', changes: this.changes });
    });
});

// --- ROTAS PARA INTEGRAÇÃO UAIRANGO (NOVAS) ---

// GET: Obter todos os estabelecimentos configurados
router.get('/uairango', (req, res) => {
    db.all("SELECT * FROM uairango_estabelecimentos ORDER BY nome_estabelecimento", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// POST: Adicionar um novo estabelecimento
router.post('/uairango', (req, res) => {
    const { id_estabelecimento, token_developer, nome_estabelecimento } = req.body;
    if (!id_estabelecimento || !token_developer || !nome_estabelecimento) {
        return res.status(400).json({ error: "Todos os campos são obrigatórios." });
    }
    const sql = `INSERT INTO uairango_estabelecimentos (id_estabelecimento, token_developer, nome_estabelecimento) VALUES (?, ?, ?)`;
    db.run(sql, [id_estabelecimento, token_developer, nome_estabelecimento], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: 'Este ID de estabelecimento já está cadastrado.' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID });
    });
});

// PUT: Ativar/Desativar um estabelecimento
router.put('/uairango/:id/toggle', (req, res) => {
    const { id } = req.params;
    const { ativo } = req.body;
    if (ativo === undefined) {
        return res.status(400).json({ error: "O status 'ativo' é obrigatório." });
    }
    const sql = `UPDATE uairango_estabelecimentos SET ativo = ? WHERE id = ?`;
    db.run(sql, [ativo, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "Estabelecimento não encontrado." });
        res.json({ message: 'Status do estabelecimento atualizado com sucesso!' });
    });
});

// DELETE: Excluir um estabelecimento
router.delete('/uairango/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM uairango_estabelecimentos WHERE id = ?`, id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "Estabelecimento não encontrado." });
        res.json({ message: 'Estabelecimento UaiRango removido com sucesso.' });
    });
});


// --- ROTAS GENÉRICAS DE CONFIGURAÇÃO (JÁ EXISTENTES) ---

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
