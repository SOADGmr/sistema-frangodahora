// ADICIONADO: Importação do 'node-fetch' para garantir compatibilidade
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { db } = require('./db');
const sseService = require('./sse-service');

const UAIRANGO_API_BASE_URL = 'https://www.uairango.com/api2';

let pollingInterval = null;
let isPolling = false;

// --- Funções de Comunicação com a API UaiRango (Lógica antiga restaurada) ---

async function getAuthToken(token_developer) {
    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token_developer }),
        });
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const responseText = await response.text();
            console.error('[UaiRango Service] Resposta de autenticação inesperada (não-JSON). Resposta:', responseText.substring(0, 500));
            return null;
        }
        const data = await response.json();
        if (response.ok && data.token) {
            return `${data.type} ${data.token}`;
        } else {
            console.error(`[UaiRango Service] Erro ao autenticar: ${data.message || 'Resposta inválida'}`);
            return null;
        }
    } catch (error) {
        console.error('[UaiRango Service] Exceção ao buscar token:', error.message);
        return null;
    }
}

async function getPendingOrdersApi(id_estabelecimento, authToken) {
    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/auth/pedidos/${id_estabelecimento}?status=0`, {
            headers: { 'Authorization': authToken },
        });
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error('A API (pedidos pendentes) retornou um formato inesperado (não-JSON).');
        }
        const data = await response.json();
        if (response.ok) {
            return data || [];
        } else {
            console.error(`[UaiRango Service] Erro ao buscar pedidos pendentes: ${data.message || 'Resposta inválida'}`);
            return [];
        }
    } catch (error) {
        console.error('[UaiRango Service] Exceção ao buscar pedidos pendentes:', error.message);
        return [];
    }
}

async function getOrderDetails(cod_pedido, authToken) {
    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/auth/pedido/${cod_pedido}`, {
            headers: { 'Authorization': authToken },
        });
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error('A API (detalhes do pedido) retornou um formato inesperado (não-JSON).');
        }
        const data = await response.json();
        if (response.ok) {
            return data;
        } else {
            console.error(`[UaiRango Service] Erro ao buscar detalhes do pedido ${cod_pedido}: ${data.message || 'Resposta inválida'}`);
            return null;
        }
    } catch (error) {
        console.error(`[UaiRango Service] Exceção ao buscar detalhes do pedido ${cod_pedido}:`, error.message);
        return null;
    }
}

// --- Funções de Ação (Aceitar, Rejeitar, etc.) ---

async function acceptOrder(cod_pedido, token_developer) {
    const authToken = await getAuthToken(token_developer);
    if (!authToken) throw new Error('Falha na autenticação com UaiRango.');
    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/auth/pedido/confirma/${cod_pedido}`, {
            method: 'POST',
            headers: { 'Authorization': authToken },
        });
        const data = await response.json();
        if (response.ok && data.success) {
            console.log(`[UaiRango Service] Pedido ${cod_pedido} aceito com sucesso no UaiRango.`);
            return data;
        } else {
            throw new Error(data.message || `Erro ao aceitar pedido ${cod_pedido} no UaiRango.`);
        }
    } catch (error) {
        console.error(`[UaiRango Service] Exceção ao aceitar pedido ${cod_pedido}:`, error.message);
        throw error;
    }
}

async function rejectOrder(cod_pedido, token_developer, motivo) {
    const authToken = await getAuthToken(token_developer);
    if (!authToken) throw new Error('Falha na autenticação com UaiRango.');
    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/auth/pedido/cancela/${cod_pedido}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authToken },
            body: JSON.stringify({ motivo }),
        });
        const data = await response.json();
        if (response.ok && data.success) {
            console.log(`[UaiRango Service] Pedido ${cod_pedido} rejeitado com sucesso no UaiRango. Motivo: ${motivo}`);
            return data;
        } else {
            // Relança o erro para que a rota possa tratar casos como "pedido não está mais pendente"
            throw new Error(data.message || `Erro ao rejeitar pedido ${cod_pedido} no UaiRango.`);
        }
    } catch (error) {
        console.error(`[UaiRango Service] Exceção ao rejeitar pedido ${cod_pedido}:`, error.message);
        throw error;
    }
}

// --- Funções de Gerenciamento da Loja (Status, Tempo) ---

async function getStoreStatus(id_estabelecimento, authToken) {
    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/auth/info/${id_estabelecimento}`, { headers: { 'Authorization': authToken } });
        const data = await response.json();
        return response.ok ? data.status_estabelecimento : null;
    } catch (error) {
        console.error(`[UaiRango Service] Exceção ao buscar status do est. ${id_estabelecimento}:`, error.message);
        return null;
    }
}

async function setStoreStatus(id_estabelecimento, authToken, status, action) {
    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/auth/info/${id_estabelecimento}/status_estabelecimento/${status}`, { method: 'PUT', headers: { 'Authorization': authToken } });
        const data = await response.json();
        if (response.ok && data.success) {
            console.log(`[UaiRango Service] Est. ${id_estabelecimento} status alterado para ${action}.`);
        } else {
            console.error(`[UaiRango Service] Falha ao alterar status do est. ${id_estabelecimento}: ${data.message}`);
        }
    } catch (error) {
        console.error(`[UaiRango Service] Exceção ao alterar status do est. ${id_estabelecimento}:`, error.message);
    }
}

async function closeStore(id_estabelecimento, token_developer) {
    const authToken = await getAuthToken(token_developer);
    if (authToken) await setStoreStatus(id_estabelecimento, authToken, 0, 'FECHADO');
}

async function openStore(id_estabelecimento, token_developer) {
    const authToken = await getAuthToken(token_developer);
    if (authToken) await setStoreStatus(id_estabelecimento, authToken, 1, 'ABERTO');
}

async function updateDeliveryTime(id_estabelecimento, token_developer, campo, tempoEmMinutos) {
    const authToken = await getAuthToken(token_developer);
    if (!authToken) return;

    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/auth/info/${id_estabelecimento}/${campo === 'id_tempo_delivery' ? 'prazo_delivery' : 'prazo_retirada'}/${tempoEmMinutos}`, {
            method: 'PUT',
            headers: { 'Authorization': authToken }
        });
        const data = await response.json();
        if (response.ok && data.success) {
            console.log(`[UaiRango Service] Tempo do est. ${id_estabelecimento} (${campo}) atualizado para ~${tempoEmMinutos} min.`);
        } else {
            console.error(`[UaiRango Service] Erro ao atualizar tempo para ${id_estabelecimento}: ${data.message}`);
        }
    } catch (error) {
        console.error(`[UaiRango Service] Exceção ao atualizar tempo para ${id_estabelecimento}:`, error.message);
    }
}

// --- Lógica Principal e Integração com DB Local ---

async function saveOrderLocallyAndNotify(orderDetails) {
    return new Promise((resolve, reject) => {
        const {
            cod_pedido, valor_total, observacao, prazo_max, forma_pagamento,
            tipo_entrega, taxa_entrega, usuario, endereco, produtos, id_estabelecimento
        } = orderDetails;

        let totalFrangos = 0;
        if (produtos && Array.isArray(produtos)) {
            produtos.forEach(produto => {
                if (produto.produto.toLowerCase().includes('frango')) totalFrangos += produto.quantidade;
            });
        }
        if (totalFrangos === 0 && produtos && produtos.length > 0) {
            totalFrangos = produtos.reduce((acc, p) => acc + p.quantidade, 0);
        }

        let formaPagamentoLocal = 'Pago';
        if (forma_pagamento) {
            const fLower = forma_pagamento.toLowerCase();
            if (fLower.includes('dinheiro')) formaPagamentoLocal = 'Dinheiro';
            else if (fLower.includes('pix')) formaPagamentoLocal = 'Pix';
            else if (fLower.includes('cartão') || fLower.includes('cartao')) formaPagamentoLocal = 'Cartão';
        }

        const isRetirada = tipo_entrega && tipo_entrega.toLowerCase() === 'retirada';
        const sql = `INSERT INTO pedidos (uairango_id_pedido, cliente_nome, cliente_telefone, cliente_endereco, cliente_bairro, quantidade_frangos, meio_frango, taxa_entrega, preco_total, forma_pagamento, canal_venda, status, horario_pedido, picado, observacao, tempo_previsto, uairango_id_estabelecimento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UaiRango', 'Pendente UaiRango', datetime('now', 'localtime'), ?, ?, ?, ?) ON CONFLICT(uairango_id_pedido) DO NOTHING`;
        const params = [cod_pedido, usuario?.nome || 'N/A', usuario?.tel1?.replace(/\D/g, '') || 'N/A', isRetirada ? 'Retirada' : `${endereco.rua}, ${endereco.num} ${endereco.complemento || ''}`.trim(), isRetirada ? '' : endereco.bairro, Math.floor(totalFrangos), (totalFrangos % 1 !== 0) ? 1 : 0, taxa_entrega || 0, valor_total, formaPagamentoLocal, 0, observacao, prazo_max, id_estabelecimento];

        db.run(sql, params, function (err) {
            if (err) return reject(err);
            if (this.changes > 0) {
                console.log(`[UaiRango Service] Pedido ${cod_pedido} importado com sucesso.`);
                sseService.sendEvent({ type: 'update-pedidos' });
                resolve(true);
            } else {
                resolve(false);
            }
        });
    });
}

async function checkForNewOrders(triggeredByFrontend = false) {
    if (isPolling && !triggeredByFrontend) return;
    isPolling = true;

    if (triggeredByFrontend) console.log('[API Trigger] Verificação de pedidos UaiRango solicitada pelo frontend.');
    console.log('Verificando novos pedidos do UaiRango e status do estoque...');

    try {
        const estabelecimentos = await new Promise((resolve, reject) => {
            db.all(`SELECT * FROM uairango_estabelecimentos WHERE ativo = 1`, [], (err, rows) => err ? reject(err) : resolve(rows || []));
        });
        if (estabelecimentos.length === 0) return;

        const serverLocalDate = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        const { inicial, vendido } = await new Promise((resolve, reject) => {
            db.get(`SELECT COALESCE(e.quantidade_inicial, 0) as inicial, (SELECT COALESCE(SUM(p.quantidade_frangos + (p.meio_frango * 0.5)), 0) FROM pedidos p WHERE p.status != 'Cancelado' AND date(p.horario_pedido) = ?) as vendido FROM estoque e WHERE e.data = ?`, [serverLocalDate, serverLocalDate], (err, row) => err ? reject(err) : resolve(row || { inicial: 0, vendido: 0 }));
        });
        const estoqueAtual = inicial - vendido;

        for (const est of estabelecimentos) {
            const autoFechar = est.auto_fechar_loja || 0;
            const autoRejeitar = est.auto_rejeitar_pedido || 0;
            console.log(`[UaiRango Service] Estoque atual: ${estoqueAtual}. Automações para ${est.nome_estabelecimento}: Fechar(${autoFechar}), Rejeitar(${autoRejeitar}).`);

            const authToken = await getAuthToken(est.token_developer);
            if (!authToken) continue;

            if (autoFechar) {
                const storeStatus = await getStoreStatus(est.id_estabelecimento, authToken);
                if (storeStatus === 1 && estoqueAtual < 1) await setStoreStatus(est.id_estabelecimento, authToken, 0, 'FECHADO');
                else if (storeStatus === 0 && estoqueAtual >= 1) await setStoreStatus(est.id_estabelecimento, authToken, 1, 'ABERTO');
            }

            const pendingOrders = await getPendingOrdersApi(est.id_estabelecimento, authToken);
            if (pendingOrders.length > 0) {
                console.log(`[UaiRango Service] ${pendingOrders.length} pedidos pendentes para ${est.nome_estabelecimento}.`);
                let availableStockForLoop = estoqueAtual;

                for (const order of pendingOrders) {
                    const orderDetails = await getOrderDetails(order.cod_pedido, authToken);
                    if (!orderDetails) continue;

                    let frangosNoPedido = 0;
                    if (orderDetails.produtos && Array.isArray(orderDetails.produtos)) {
                        orderDetails.produtos.forEach(p => { if (p.produto.toLowerCase().includes('frango')) frangosNoPedido += p.quantidade; });
                        if (frangosNoPedido === 0) frangosNoPedido = orderDetails.produtos.reduce((acc, p) => acc + p.quantidade, 0);
                    }
                    
                    if (autoRejeitar && frangosNoPedido > availableStockForLoop) {
                        console.warn(`[UaiRango Service] Rejeitando pedido ${order.cod_pedido} por falta de estoque.`);
                        await rejectOrder(order.cod_pedido, est.token_developer, 'Estoque insuficiente no momento.');
                    } else {
                        console.log(`[UaiRango Service] Salvando pedido ${order.cod_pedido} localmente.`);
                        if (await saveOrderLocallyAndNotify(orderDetails)) {
                           availableStockForLoop -= frangosNoPedido;
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('[UaiRango Service] Erro no ciclo de verificação:', error.message);
    } finally {
        isPolling = false;
    }
}

function startPolling(minutes) {
    console.log(`[UaiRango Service] Serviço de busca de pedidos iniciado. Verificando a cada ${minutes} minuto(s).`);
    checkForNewOrders();
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(checkForNewOrders, minutes * 20 * 1000);
}

module.exports = {
    acceptOrder,
    rejectOrder,
    updateDeliveryTime,
    closeStore,
    openStore,
    checkForNewOrders,
    startPolling,
};

