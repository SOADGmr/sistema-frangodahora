const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { db } = require('./db');

// URL base da API do UaiRango
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
            body: JSON.stringify({ token: token_developer }),
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
    if (!authToken) {
        throw new Error('Falha na autenticação com UaiRango.');
    }
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
    if (!authToken) {
        throw new Error('Falha na autenticação com UaiRango.');
    }
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
            console.log(`[UaiRango Service] Pedido ${cod_pedido} rejeitado com sucesso no UaiRango.`);
            return true;
        } else {
            throw new Error(data.message || `Erro ao rejeitar pedido ${cod_pedido} no UaiRango.`);
        }
    } catch (error) {
        console.error(`[UaiRango Service] Exceção ao rejeitar pedido ${cod_pedido}:`, error.message);
        throw error;
    }
}

// NOVO: Função para buscar os prazos disponíveis na API do UaiRango
async function getAvailableTimes(authToken) {
    try {
        const response = await fetch(`${UAIRANGO_API_BASE_URL}/auth/info/prazos`, {
            headers: { 'Authorization': authToken },
        });
        const data = await response.json();
        if (response.ok && Array.isArray(data)) {
            return data;
        } else {
            console.error(`[UaiRango Service] Erro ao buscar prazos: ${data.message || 'Resposta inválida'}`);
            return [];
        }
    } catch (error) {
        console.error('[UaiRango Service] Exceção ao buscar prazos:', error.message);
        return [];
    }
}

// ATUALIZADO: Função para encontrar o ID do prazo com a lógica aprimorada
function findBestTimeId(targetTime, availableTimes) {
    if (!availableTimes || availableTimes.length === 0) return null;

    // 1. Filtra apenas os tempos ativos e calcula a média de cada um
    const activeTimes = availableTimes
        .filter(t => t.status === 1)
        .map(t => ({
            ...t,
            avg: (t.min + t.max) / 2
        }));

    if (activeTimes.length === 0) {
        console.warn('[UaiRango Service] Nenhum prazo de entrega/retirada ativo encontrado na API do UaiRango.');
        return null;
    }

    let bestMatch = null;
    let smallestDiff = Infinity;

    // 2. Itera para encontrar a melhor correspondência
    for (const time of activeTimes) {
        const diff = Math.abs(targetTime - time.avg);

        if (diff < smallestDiff) {
            smallestDiff = diff;
            bestMatch = time;
        } else if (diff === smallestDiff) {
            // 3. Regra de desempate: se a diferença for a mesma, prefere o tempo médio maior.
            if (bestMatch && time.avg > bestMatch.avg) {
                bestMatch = time;
            }
        }
    }
    
    if (bestMatch) {
         console.log(`[UaiRango Service] Para o tempo de ${targetTime} min, o melhor intervalo encontrado foi ${bestMatch.min}-${bestMatch.max} min (média: ${bestMatch.avg}). ID: ${bestMatch.id_tempo}`);
    }

    return bestMatch ? bestMatch.id_tempo : null;
}

// NOVO: Função para atualizar o tempo de entrega/retirada no UaiRango
async function updateUaiRangoTime(id_estabelecimento, token_developer, campo, tempoEmMinutos) {
    console.log(`[UaiRango Service] Iniciando atualização de tempo para ${campo} do estabelecimento ${id_estabelecimento} para ${tempoEmMinutos} minutos.`);
    const authToken = await getAuthToken(token_developer);
    if (!authToken) {
        console.error(`[UaiRango Service] Falha ao obter token para o estabelecimento ${id_estabelecimento}. Abortando atualização de tempo.`);
        return;
    }
    
    const availableTimes = await getAvailableTimes(authToken);
    const timeId = findBestTimeId(tempoEmMinutos, availableTimes);

    // Se um ID correspondente for encontrado, usa a nova rota
    if (timeId) {
        try {
            const response = await fetch(`${UAIRANGO_API_BASE_URL}/auth/info/${id_estabelecimento}/${campo}/${timeId}`, {
                method: 'PUT',
                headers: { 'Authorization': authToken },
            });
            const data = await response.json();
            if (response.ok && data.success) {
                console.log(`[UaiRango Service] Tempo (${campo}) do est. ${id_estabelecimento} atualizado com sucesso para o ID ${timeId} (~${tempoEmMinutos} min).`);
            } else {
                console.error(`[UaiRango Service] Erro ao atualizar tempo (${campo}) para ${id_estabelecimento}: ${data.message || 'Erro desconhecido'}`);
            }
        } catch (error) {
            console.error(`[UaiRango Service] Exceção ao atualizar tempo (${campo}) para ${id_estabelecimento}:`, error.message);
        }
    } else {
        // Se não, tenta usar a rota antiga como fallback
        console.warn(`[UaiRango Service] Não foi possível encontrar um ID de tempo correspondente para ${tempoEmMinutos} minutos. Usando a rota antiga como fallback.`);
        const campoAntigo = campo === 'id_tempo_delivery' ? 'prazo_delivery' : 'prazo_retirada';
        try {
            const response = await fetch(`${UAIRANGO_API_BASE_URL}/auth/info/${id_estabelecimento}/${campoAntigo}/${tempoEmMinutos}`, {
                method: 'PUT',
                headers: { 'Authorization': authToken },
            });
            const data = await response.json();
             if (response.ok && data.success) {
                console.log(`[UaiRango Service] Tempo (${campoAntigo}) do est. ${id_estabelecimento} atualizado com sucesso para ${tempoEmMinutos} minutos via rota antiga.`);
            } else {
                console.error(`[UaiRango Service] Erro ao atualizar tempo (${campoAntigo}) via rota antiga para ${id_estabelecimento}: ${data.message || 'Erro desconhecido'}`);
            }
        } catch (error) {
            console.error(`[UaiRango Service] Exceção ao atualizar tempo (${campoAntigo}) via rota antiga para ${id_estabelecimento}:`, error.message);
        }
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

module.exports = { startPolling, stopPolling, acceptOrder, rejectOrder, updateUaiRangoTime };

