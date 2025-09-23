const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { db } = require('./db');

// CORREÇÃO: URL base da API ajustada para a correta
const UAIRANGO_API_BASE_URL = 'https://www.uairango.com/api2';

let pollingInterval;
let isPolling = false;

// Função para buscar o token de autenticação da UaiRango
async function getAuthToken(token_developer) {
    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token: token_developer }), // CORREÇÃO: O corpo da requisição espera a chave "token"
        });
        const data = await response.json();
        if (response.ok && data.token) {
            return `${data.type} ${data.token}`; // Retorna o token Bearer completo
        } else {
            console.error(`[UaiRango Service] Erro ao autenticar: ${data.message || 'Resposta inválida'}`);
            return null;
        }
    } catch (error) {
        console.error('[UaiRango Service] Exceção ao buscar token:', error.message);
        return null;
    }
}

// Função para buscar pedidos pendentes de um estabelecimento
async function getPendingOrders(id_estabelecimento, authToken) {
    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/auth/pedidos/${id_estabelecimento}?status=0`, { // status=0 para pendentes
            headers: { 'Authorization': authToken },
        });
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

// Função para buscar os detalhes de um pedido específico
async function getOrderDetails(cod_pedido, authToken) {
    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/auth/pedido/${cod_pedido}`, {
            headers: { 'Authorization': authToken },
        });
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

// Função para salvar o pedido no nosso banco de dados local
async function saveOrderLocally(orderDetails) {
    try {
        // Envia para uma rota local que sabe como processar esses dados
        const response = await fetch('http://localhost:3000/api/pedidos/uairango', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderDetails),
        });
        if (!response.ok) {
            const errorBody = await response.json();
            console.error(`[UaiRango Service] Falha ao chamar a API local para salvar o pedido ${orderDetails.cod_pedido}:`, errorBody);
        }
    } catch (error) {
        console.error(`[UaiRango Service] Exceção ao chamar a API local para salvar o pedido ${orderDetails.cod_pedido}:`, error.message);
    }
}

async function checkForNewOrders() {
    if (isPolling) return;
    isPolling = true;
    console.log("Verificando novos pedidos do UaiRango...");

    db.all(`SELECT id, id_estabelecimento, token_developer, nome_estabelecimento FROM uairango_estabelecimentos WHERE ativo = 1`, [], async (err, estabelecimentos) => {
        if (err) {
            console.error('[UaiRango Service] Erro ao buscar estabelecimentos no DB:', err.message);
            isPolling = false;
            return;
        }

        if (!estabelecimentos || estabelecimentos.length === 0) {
            isPolling = false;
            return;
        }

        for (const est of estabelecimentos) {
            console.log(`[UaiRango Service] Processando: ${est.nome_estabelecimento} (ID: ${est.id_estabelecimento})`);
            const authToken = await getAuthToken(est.token_developer);
            if (!authToken) continue;

            const pendingOrders = await getPendingOrders(est.id_estabelecimento, authToken);
            if (pendingOrders.length > 0) {
                console.log(`[UaiRango Service] Encontrados ${pendingOrders.length} pedidos pendentes para ${est.nome_estabelecimento}.`);
                for (const order of pendingOrders) {
                    const orderDetails = await getOrderDetails(order.cod_pedido, authToken);
                    if (orderDetails) {
                        await saveOrderLocally(orderDetails);
                    }
                }
            }
        }
        isPolling = false;
    });
}

function startPolling(minutes) {
    console.log(`[UaiRango Service] Serviço de busca de pedidos iniciado. Verificando a cada ${minutes} minuto(s).`);
    checkForNewOrders(); // Executa imediatamente ao iniciar
    pollingInterval = setInterval(checkForNewOrders, minutes * 60 * 1000);
}

function stopPolling() {
    console.log('[UaiRango Service] Serviço de busca de pedidos parado.');
    clearInterval(pollingInterval);
}

module.exports = { startPolling, stopPolling };

