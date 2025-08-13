const express = require('express');
const router = express.Router();
const db = require('../db');
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

module.exports = router;
