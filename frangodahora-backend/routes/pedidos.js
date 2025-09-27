const express = require('express');
const router = express.Router();
const db = require('../db').db;
const uairangoService = require('../uairango-service');
const sseService = require('../sse-service'); // Importa o serviço de eventos

// Rota para criar um novo pedido (manual ou pelo cliente)
router.post('/', (req, res) => {
    const {
        cliente_nome, cliente_endereco, cliente_bairro, cliente_referencia, cliente_telefone,
        quantidade_frangos, meio_frango, taxa_entrega, preco_total, forma_pagamento,
        canal_venda, picado, observacao, tempo_previsto
    } = req.body;

    const quantidadePedido = Number(quantidade_frangos) + (meio_frango ? 0.5 : 0);
    const serverLocalDate = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    Promise.all([
        new Promise((resolve, reject) => {
            db.get(`SELECT quantidade_inicial FROM estoque WHERE data = ?`, [serverLocalDate], (err, row) => {
                if (err) return reject(err);
                resolve(row ? row.quantidade_inicial : 0);
            });
        }),
        new Promise((resolve, reject) => {
            db.get(`SELECT SUM(quantidade_frangos + (meio_frango * 0.5)) AS total_vendido FROM pedidos WHERE status != 'Cancelado' AND date(horario_pedido) = ?`, [serverLocalDate], (err, row) => {
                if (err) return reject(err);
                resolve(row && row.total_vendido ? row.total_vendido : 0);
            });
        })
    ]).then(([estoqueInicial, totalVendido]) => {
        const estoqueAtual = estoqueInicial - totalVendido;
        if (estoqueAtual < quantidadePedido) {
            return res.status(400).json({ error: `Estoque insuficiente. Restam apenas ${estoqueAtual} frangos.` });
        }
        inserirPedido();
    }).catch(err => {
        res.status(500).json({ error: 'Erro ao verificar o estoque: ' + err.message });
    });

    const inserirPedido = () => {
        const sql = `INSERT INTO pedidos (cliente_nome, cliente_endereco, cliente_bairro, cliente_referencia, cliente_telefone, quantidade_frangos, meio_frango, taxa_entrega, preco_total, forma_pagamento, canal_venda, status, horario_pedido, picado, observacao, tempo_previsto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendente', datetime('now', 'localtime'), ?, ?, ?)`;
        const params = [cliente_nome, cliente_endereco, cliente_bairro, cliente_referencia, cliente_telefone, quantidade_frangos, meio_frango, taxa_entrega, preco_total, forma_pagamento, canal_venda, picado, observacao, tempo_previsto];
        
        db.run(sql, params, function(err) {
            if (err) return res.status(500).json({ error: err.message });
            sseService.sendEvent({ type: 'update-pedidos' }); // Notifica o frontend
            res.status(201).json({ message: 'Pedido criado com sucesso!', pedidoId: this.lastID });
        });
    };

    if (cliente_endereco !== 'Retirada' && cliente_bairro) {
        db.get('SELECT * FROM taxas_bairro WHERE bairro = ?', [cliente_bairro], (err, row) => {
            if (err) return;
            if (!row) {
                db.run('INSERT INTO taxas_bairro (bairro, taxa) VALUES (?, ?)', [cliente_bairro, taxa_entrega], (err) => {
                    if (err) console.error("Erro ao auto-cadastrar bairro:", err.message);
                });
            }
        });
    }
});

// Rota para receber e salvar um pedido vindo do UaiRango
router.post('/uairango', (req, res) => {
    // ... (código existente da rota)
    const uairangoOrder = req.body;
    const {
        cod_pedido, valor_total, observacao, prazo_max, forma_pagamento,
        tipo_entrega, taxa_entrega, usuario, endereco, produtos, id_estabelecimento
    } = uairangoOrder;
    // ... (lógica para processar o pedido)
    let totalFrangos = 0;
    if (produtos && Array.isArray(produtos)) {
        produtos.forEach(produto => {
            const nomeProduto = produto.produto.toLowerCase();
            if (nomeProduto.includes('frango')) {
                totalFrangos += produto.quantidade;
            }
        });
    }
    if (totalFrangos === 0 && produtos && produtos.length > 0) {
        totalFrangos = produtos.reduce((acc, p) => acc + p.quantidade, 0);
    }
    let formaPagamentoLocal = 'Pago'; 
    if (forma_pagamento) {
        const formaPagamentoLower = forma_pagamento.toLowerCase();
        if (formaPagamentoLower.includes('dinheiro')) formaPagamentoLocal = 'Dinheiro';
        else if (formaPagamentoLower.includes('pix')) formaPagamentoLocal = 'Pix';
        else if (formaPagamentoLower.includes('cartão') || formaPagamentoLower.includes('cartao')) formaPagamentoLocal = 'Cartão';
        else if (formaPagamentoLower.includes('online')) formaPagamentoLocal = 'Pago';
    }
    const isRetirada = tipo_entrega && tipo_entrega.toLowerCase() === 'retirada';
    const sql = `
        INSERT INTO pedidos (
            uairango_id_pedido, cliente_nome, cliente_telefone, cliente_endereco, cliente_bairro,
            quantidade_frangos, meio_frango, taxa_entrega, preco_total, forma_pagamento,
            canal_venda, status, horario_pedido, picado, observacao, tempo_previsto,
            uairango_id_estabelecimento
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UaiRango', 'Pendente UaiRango', datetime('now', 'localtime'), ?, ?, ?, ?)
        ON CONFLICT(uairango_id_pedido) DO NOTHING
    `;
    const params = [
        cod_pedido, usuario ? usuario.nome : 'N/A',
        (usuario && usuario.tel1) ? usuario.tel1.replace(/\D/g, '') : 'N/A',
        isRetirada ? 'Retirada' : `${endereco.rua}, ${endereco.num} ${endereco.complemento || ''}`.trim(),
        isRetirada ? '' : endereco.bairro, Math.floor(totalFrangos),
        (totalFrangos % 1 !== 0) ? 1 : 0, taxa_entrega || 0, valor_total,
        formaPagamentoLocal, 0, observacao, prazo_max, id_estabelecimento
    ];
    db.run(sql, params, function(err) {
        if (err) {
            console.error("[UaiRango Service] Erro ao salvar pedido no banco de dados:", err.message);
            return res.status(500).json({ error: err.message });
        }
        if (this.changes > 0) {
            console.log(`[UaiRango Service] Pedido ${cod_pedido} importado com sucesso.`);
            sseService.sendEvent({ type: 'update-pedidos' }); // Notifica o frontend
        }
        res.status(200).json({ message: 'Pedido processado.' });
    });
});

// ... (GET '/', GET '/:id', PUT '/:id' permanecem os mesmos)

router.get('/', (req, res) => {
    const data = req.query.data || new Date().toISOString().slice(0, 10);
    const sql = `
        SELECT p.*, m.nome as motoqueiro_nome 
        FROM pedidos p 
        LEFT JOIN motoqueiros m ON p.motoqueiro_id = m.id
        WHERE date(p.horario_pedido) = ?
        ORDER BY 
            CASE 
                WHEN p.status = 'Pendente UaiRango' THEN 0
                WHEN p.status = 'Pendente' THEN 1
                WHEN p.status = 'Em Rota' THEN 2
                WHEN p.status = 'Entregue' THEN 3
                WHEN p.status = 'Cancelado' THEN 4
                ELSE 5
            END,
            id DESC
    `;
    db.all(sql, [data], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

const findEstabelecimentoByPedido = () => {
    return new Promise((resolve, reject) => {
        db.get(`SELECT id_estabelecimento, token_developer FROM uairango_estabelecimentos WHERE ativo = 1 LIMIT 1`, [], (err, row) => {
            if (err) return reject(new Error('Erro ao buscar credenciais do estabelecimento.'));
            if (!row) return reject(new Error('Nenhum estabelecimento UaiRango ativo encontrado para processar a ação.'));
            resolve(row);
        });
    });
};

router.post('/uairango/:id/aceitar', async (req, res) => {
    const { id } = req.params;
    try {
        const pedido = await new Promise((resolve, reject) => {
            db.get("SELECT uairango_id_pedido FROM pedidos WHERE id = ?", [id], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });

        if (!pedido || !pedido.uairango_id_pedido) {
            return res.status(404).json({ error: 'Pedido local ou ID UaiRango não encontrado.' });
        }

        const est = await findEstabelecimentoByPedido();
        
        await uairangoService.acceptOrder(pedido.uairango_id_pedido, est.token_developer);

        db.run("UPDATE pedidos SET status = 'Pendente' WHERE id = ?", [id], function(err) {
            if (err) return res.status(500).json({ error: 'Erro ao atualizar status do pedido local.' });
            sseService.sendEvent({ type: 'update-pedidos' }); // Notifica o frontend
            res.json({ message: 'Pedido aceito com sucesso!' });
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/uairango/:id/rejeitar', async (req, res) => {
    const { id } = req.params;
    const { motivo } = req.body;

    if (!motivo) {
        return res.status(400).json({ error: 'O motivo da rejeição é obrigatório.' });
    }

    try {
        const pedido = await new Promise((resolve, reject) => {
            db.get("SELECT uairango_id_pedido FROM pedidos WHERE id = ?", [id], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });

        if (!pedido || !pedido.uairango_id_pedido) {
            return res.status(404).json({ error: 'Pedido local ou ID UaiRango não encontrado.' });
        }
        
        const est = await findEstabelecimentoByPedido();

        try {
            await uairangoService.rejectOrder(pedido.uairango_id_pedido, est.token_developer, motivo);
        } catch (uairangoError) {
            if (uairangoError.message && !uairangoError.message.includes('não está mais pendente')) {
                throw uairangoError;
            }
            console.warn(`[UaiRango Sync] Pedido ${pedido.uairango_id_pedido} já não estava pendente. Sincronizando status local.`);
        }
        
        db.run("UPDATE pedidos SET status = 'Cancelado' WHERE id = ?", [id], function(err) {
            if (err) return res.status(500).json({ error: 'Erro ao atualizar status do pedido local.' });
            sseService.sendEvent({ type: 'update-pedidos' }); // Notifica o frontend
            res.json({ message: 'Pedido rejeitado/sincronizado com sucesso!' });
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


router.get('/:id', (req, res) => {
    const { id } = req.params;
    const sql = `
        SELECT p.*, m.nome as motoqueiro_nome 
        FROM pedidos p 
        LEFT JOIN motoqueiros m ON p.motoqueiro_id = m.id
        WHERE p.id = ?
    `;
    db.get(sql, [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "Pedido não encontrado." });
        res.json(row);
    });
});

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
        sseService.sendEvent({ type: 'update-pedidos' }); // Notifica o frontend
        res.json({ message: 'Pedido atualizado com sucesso!', changes: this.changes });
    });
});

router.put('/:id/atribuir', (req, res) => {
    const pedidoIdNum = parseInt(req.params.id, 10);
    const motoqueiroIdNum = parseInt(req.body.motoqueiroId, 10);

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        const findMaxOrderSql = `SELECT MAX(rota_ordem) as max_ordem FROM pedidos WHERE motoqueiro_id = ? AND date(horario_pedido) = date('now', 'localtime')`;
        db.get(findMaxOrderSql, [motoqueiroIdNum], (err, row) => {
            if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: "Erro ao buscar a ordem da rota: " + err.message }); }
            const newOrder = (row && row.max_ordem != null) ? row.max_ordem + 1 : 1;
            const updatePedidoSql = `UPDATE pedidos SET motoqueiro_id = ?, status = 'Em Rota', rota_ordem = ? WHERE id = ?`;
            db.run(updatePedidoSql, [motoqueiroIdNum, newOrder, pedidoIdNum], function(err) {
                if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: "Erro ao atribuir o pedido: " + err.message }); }
                db.run("COMMIT", (commitErr) => {
                    if (commitErr) return res.status(500).json({ error: "Erro ao finalizar a transação: " + commitErr.message });
                    sseService.sendEvent({ type: 'update-pedidos' }); // Notifica o frontend
                    res.json({ message: 'Motoqueiro atribuído com sucesso!' });
                });
            });
        });
    });
});

router.put('/:id/entregar', (req, res) => {
    db.run("UPDATE pedidos SET status = 'Entregue' WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        sseService.sendEvent({ type: 'update-pedidos' }); // Notifica o frontend
        res.json({ message: 'Pedido marcado como entregue.' });
    });
});

router.put('/:id/retirou', (req, res) => {
    db.run("UPDATE pedidos SET status = 'Entregue' WHERE id = ? AND cliente_endereco = 'Retirada'", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        sseService.sendEvent({ type: 'update-pedidos' }); // Notifica o frontend
        res.json({ message: 'Pedido marcado como retirado.' });
    });
});

router.put('/:id/cancelar', (req, res) => {
    db.run("UPDATE pedidos SET status = 'Cancelado', motoqueiro_id = NULL, rota_ordem = 0 WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        sseService.sendEvent({ type: 'update-pedidos' }); // Notifica o frontend
        res.json({ message: 'Pedido cancelado.' });
    });
});

router.put('/ordenar-rota', (req, res) => {
    const { ordem, motoqueiroId } = req.body;
    if (!ordem || !Array.isArray(ordem) || !motoqueiroId) {
        return res.status(400).json({ error: 'Dados inválidos.' });
    }
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        const promises = ordem.map((pedidoId, index) => {
            return new Promise((resolve, reject) => {
                db.run("UPDATE pedidos SET rota_ordem = ? WHERE id = ? AND motoqueiro_id = ?", [index + 1, parseInt(pedidoId, 10), parseInt(motoqueiroId, 10)], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
        Promise.all(promises)
            .then(() => {
                db.run("COMMIT", (commitErr) => {
                    if (commitErr) return res.status(500).json({ error: commitErr.message });
                    sseService.sendEvent({ type: 'update-pedidos' }); // Notifica o frontend
                    res.json({ message: 'Rota de entrega ordenada com sucesso.' });
                });
            })
            .catch(error => {
                db.run("ROLLBACK");
                res.status(500).json({ error: "Erro ao atualizar a rota: " + error.message });
            });
    });
});

module.exports = router;

