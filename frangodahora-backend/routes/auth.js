const express = require('express');
const router = express.Router();
const { db } = require('../db'); // CORREÇÃO APLICADA
const bcrypt = require('bcrypt');

// Rota de Login
router.post('/login', (req, res) => {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
    }

    const sql = "SELECT * FROM usuarios WHERE usuario = ?";
    db.get(sql, [usuario], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Erro interno do servidor.' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        }

        // Compara a senha enviada com o hash armazenado no banco
        bcrypt.compare(senha, user.senha, (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'Erro ao verificar a senha.' });
            }
            if (result) {
                // Login bem-sucedido
                res.json({
                    message: 'Login bem-sucedido!',
                    usuario: {
                        id: user.id,
                        usuario: user.usuario,
                        cargo: user.cargo
                    }
                });
            } else {
                // Senha incorreta
                res.status(401).json({ error: 'Usuário ou senha inválidos.' });
            }
        });
    });
});


// --- ROTAS PARA GERENCIAMENTO DE USUÁRIOS (NOVO) ---

// GET: Obter todos os usuários
router.get('/users', (req, res) => {
    db.all("SELECT id, usuario, cargo FROM usuarios ORDER BY usuario", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// POST: Criar um novo usuário
router.post('/users', (req, res) => {
    const { usuario, senha, cargo } = req.body;

    if (!usuario || !senha || !cargo) {
        return res.status(400).json({ error: 'Usuário, senha e cargo são obrigatórios.' });
    }
    if (!['Admin', 'Moto'].includes(cargo)) {
        return res.status(400).json({ error: 'O cargo deve ser "Admin" ou "Moto".' });
    }
    if (senha.length < 6) {
        return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    const saltRounds = 10;
    bcrypt.hash(senha, saltRounds, (err, hash) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao criar hash da senha.' });
        }
        const sql = `INSERT INTO usuarios (usuario, senha, cargo) VALUES (?, ?, ?)`;
        db.run(sql, [usuario, hash, cargo], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ error: 'Este nome de usuário já existe.' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ id: this.lastID, usuario, cargo });
        });
    });
});

// DELETE: Excluir um usuário
router.delete('/users/:id', (req, res) => {
    const { id } = req.params;
    // Prevenção para não excluir o usuário admin principal (ID 1)
    if (id === '1') {
        return res.status(403).json({ error: 'Não é possível excluir o administrador principal.' });
    }
    db.run(`DELETE FROM usuarios WHERE id = ?`, id, function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: "Usuário não encontrado." });
        }
        res.json({ message: 'Usuário excluído com sucesso', changes: this.changes });
    });
});


module.exports = router;
