const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { db } = require('./db');

const UAIRANGO_API_BASE_URL = 'https://www.uairango.com/api2';

let pollingInterval;
let isPolling = false;

// Função para buscar o token de autenticação da UaiRango
async function getAuthToken(token_developer) {
    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token_developer }),
        });
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

// Função para buscar pedidos pendentes de um estabelecimento
async function getPendingOrders(id_estabelecimento, authToken) {
    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/auth/pedidos/${id_estabelecimento}?status=0`, {
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

// Função para aceitar um pedido na API do UaiRango
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
            return true;
        } else {
            throw new Error(data.message || `Erro ao aceitar pedido ${cod_pedido} no UaiRango.`);
        }
    } catch (error) {
        console.error(`[UaiRango Service] Exceção ao aceitar pedido ${cod_pedido}:`, error.message);
        throw error;
    }
}

// Função para rejeitar um pedido na API do UaiRango
async function rejectOrder(cod_pedido, token_developer, motivo) {
    const authToken = await getAuthToken(token_developer);
    if (!authToken) throw new Error('Falha na autenticação com UaiRango.');
    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/auth/pedido/cancela/${cod_pedido}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authToken,
            },
            body: JSON.stringify({ motivo }),
        });
        const data = await response.json();
        if (response.ok && data.success) {
            console.log(`[UaiRango Service] Pedido ${cod_pedido} rejeitado com sucesso no UaiRango. Motivo: ${motivo}`);
            return true;
        } else {
            throw new Error(data.message || `Erro ao rejeitar pedido ${cod_pedido} no UaiRango.`);
        }
    } catch (error) {
        console.error(`[UaiRango Service] Exceção ao rejeitar pedido ${cod_pedido}:`, error.message);
        throw error;
    }
}

// Função para buscar os prazos disponíveis na API do UaiRango
async function getAvailableTimes(authToken) {
    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/auth/info/prazos`, {
            headers: { 'Authorization': authToken },
        });
        const data = await response.json();
        return (response.ok && Array.isArray(data)) ? data : [];
    } catch (error) {
        console.error('[UaiRango Service] Exceção ao buscar prazos:', error.message);
        return [];
    }
}

function findBestTimeId(targetTime, availableTimes) {
    if (!availableTimes || availableTimes.length === 0) return null;
    const activeTimes = availableTimes.filter(t => t.status === 1).map(t => ({ ...t, avg: (t.min + t.max) / 2 }));
    if (activeTimes.length === 0) return null;

    let bestMatch = activeTimes.reduce((best, current) => {
        const currentDiff = Math.abs(targetTime - current.avg);
        const bestDiff = Math.abs(targetTime - best.avg);
        if (currentDiff < bestDiff) return current;
        if (currentDiff === bestDiff && current.avg > best.avg) return current;
        return best;
    });
    return bestMatch.id_tempo;
}

async function updateUaiRangoTime(id_estabelecimento, token_developer, campo, tempoEmMinutos) {
    const authToken = await getAuthToken(token_developer);
    if (!authToken) return;
    
    const availableTimes = await getAvailableTimes(authToken);
    const timeId = findBestTimeId(tempoEmMinutos, availableTimes);

    const endpoint = timeId ? `${UAIRANGO_API_BASE_URL}/auth/info/${id_estabelecimento}/${campo}/${timeId}` : `${UAIRANGO_API_BASE_URL}/auth/info/${id_estabelecimento}/${campo === 'id_tempo_delivery' ? 'prazo_delivery' : 'prazo_retirada'}/${tempoEmMinutos}`;
    
    try {
        const response = await fetch(endpoint, { method: 'PUT', headers: { 'Authorization': authToken } });
        const data = await response.json();
        if (response.ok && data.success) {
            console.log(`[UaiRango Service] Tempo do est. ${id_estabelecimento} atualizado para ~${tempoEmMinutos} min.`);
        } else {
            console.error(`[UaiRango Service] Erro ao atualizar tempo para ${id_estabelecimento}: ${data.message}`);
        }
    } catch (error) {
        console.error(`[UaiRango Service] Exceção ao atualizar tempo para ${id_estabelecimento}:`, error.message);
    }
}

// Funções para controle de estoque e loja
async function getCurrentStock() {
    const today = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    return new Promise((resolve, reject) => {
        db.get(`SELECT quantidade_inicial FROM estoque WHERE data = ?`, [today], (err, row) => {
            if (err) return reject(err);
            const stockInicial = row ? row.quantidade_inicial : 0;
            db.get(`SELECT SUM(quantidade_frangos + (meio_frango * 0.5)) AS total_vendido FROM pedidos WHERE status != 'Cancelado' AND date(horario_pedido) = ?`, [today], (err, row) => {
                if (err) return reject(err);
                const totalVendido = row && row.total_vendido ? row.total_vendido : 0;
                resolve(stockInicial - totalVendido);
            });
        });
    });
}

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

async function setStoreStatus(id_estabelecimento, authToken, status) {
    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/auth/info/${id_estabelecimento}/status_estabelecimento/${status}`, { method: 'PUT', headers: { 'Authorization': authToken } });
        const data = await response.json();
        if (response.ok && data.success) {
            console.log(`[UaiRango Service] Est. ${id_estabelecimento} status alterado para ${status === 1 ? 'ABERTO' : 'FECHADO'}.`);
        } else {
            console.error(`[UaiRango Service] Falha ao alterar status do est. ${id_estabelecimento}: ${data.message}`);
        }
    } catch (error) {
        console.error(`[UaiRango Service] Exceção ao alterar status do est. ${id_estabelecimento}:`, error.message);
    }
}

// NOVO: Busca as configurações de automação do banco de dados
async function getUaiRangoSettings() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT chave, valor FROM configuracoes WHERE chave LIKE 'uairango_%'`, [], (err, rows) => {
            if (err) return reject(err);
            const settings = rows.reduce((acc, row) => {
                acc[row.chave] = row.valor;
                return acc;
            }, {});
            // Define valores padrão caso não existam no banco
            settings.uairango_auto_close = settings.uairango_auto_close ?? '1';
            settings.uairango_auto_reject = settings.uairango_auto_reject ?? '1';
            resolve(settings);
        });
    });
}


// ATUALIZADO: Função principal de polling com a nova lógica condicional
async function checkForNewOrders() {
    if (isPolling) return;
    isPolling = true;
    console.log("Verificando novos pedidos do UaiRango e status do estoque...");

    try {
        const uaiRangoSettings = await getUaiRangoSettings();
        const currentStock = await getCurrentStock();
        console.log(`[UaiRango Service] Estoque atual: ${currentStock}. Automações: Fechar(${uaiRangoSettings.uairango_auto_close}), Rejeitar(${uaiRangoSettings.uairango_auto_reject}).`);

        const estabelecimentos = await new Promise((resolve, reject) => {
            db.all(`SELECT id, id_estabelecimento, token_developer, nome_estabelecimento FROM uairango_estabelecimentos WHERE ativo = 1`, [], (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });

        if (estabelecimentos.length === 0) {
            isPolling = false;
            return;
        }

        for (const est of estabelecimentos) {
            const authToken = await getAuthToken(est.token_developer);
            if (!authToken) continue;

            // Lógica para fechar/abrir a loja, se ativada
            if (uaiRangoSettings.uairango_auto_close === '1') {
                const storeStatus = await getStoreStatus(est.id_estabelecimento, authToken);
                if (storeStatus !== null) {
                    if (currentStock < 1 && storeStatus === 1) {
                        console.log(`[UaiRango Service] Estoque baixo. Fechando a loja ${est.nome_estabelecimento}.`);
                        await setStoreStatus(est.id_estabelecimento, authToken, 0);
                    } else if (currentStock >= 1 && storeStatus === 0) {
                        console.log(`[UaiRango Service] Estoque disponível. Abrindo a loja ${est.nome_estabelecimento}.`);
                        await setStoreStatus(est.id_estabelecimento, authToken, 1);
                    }
                }
            }

            const pendingOrders = await getPendingOrders(est.id_estabelecimento, authToken);
            if (pendingOrders.length > 0) {
                console.log(`[UaiRango Service] ${pendingOrders.length} pedidos pendentes para ${est.nome_estabelecimento}.`);
                let availableStock = await getCurrentStock();

                for (const order of pendingOrders) {
                    const orderDetails = await getOrderDetails(order.cod_pedido, authToken);
                    if (!orderDetails) continue;

                    let frangosNoPedido = 0;
                    if (orderDetails.produtos && Array.isArray(orderDetails.produtos)) {
                        orderDetails.produtos.forEach(p => {
                            if (p.produto.toLowerCase().includes('frango')) frangosNoPedido += p.quantidade;
                        });
                        if (frangosNoPedido === 0) frangosNoPedido = orderDetails.produtos.reduce((acc, p) => acc + p.quantidade, 0);
                    }

                    // Lógica para rejeitar pedido, se ativada
                    if (uaiRangoSettings.uairango_auto_reject === '1' && frangosNoPedido > availableStock) {
                        console.warn(`[UaiRango Service] Rejeitando pedido ${order.cod_pedido} por falta de estoque. Pedido: ${frangosNoPedido}, Estoque: ${availableStock}.`);
                        await rejectOrder(order.cod_pedido, est.token_developer, 'Estoque insuficiente no momento.');
                    } else {
                        console.log(`[UaiRango Service] Pedido ${order.cod_pedido} tem estoque suficiente ou a rejeição automática está desligada. Salvando localmente.`);
                        await saveOrderLocally(orderDetails);
                        availableStock -= frangosNoPedido;
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
    checkForNewOrders(); // Executa imediatamente ao iniciar
    pollingInterval = setInterval(checkForNewOrders, minutes * 60 * 1000);
}

function stopPolling() {
    console.log('[UaiRango Service] Serviço de busca de pedidos parado.');
    clearInterval(pollingInterval);
}

module.exports = { startPolling, stopPolling, acceptOrder, rejectOrder, updateUaiRangoTime };

