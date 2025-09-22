// frangodahora-backend/uairango-service.js
const db = require('./db');

// URL base da API do UaiRango
const UAIRANGO_API_URL = 'https://www.uairango.com/api2';

// Variável para armazenar o intervalo da busca de pedidos
let pollingInterval;

/**
 * Função principal que verifica novos pedidos para todos os estabelecimentos ativos.
 */
async function checkForNewOrders() {
    console.log('Verificando novos pedidos do UaiRango...');

    // 1. Busca todos os estabelecimentos ativos no nosso banco de dados.
    const sql = `SELECT id, id_estabelecimento, token_developer, nome_estabelecimento FROM uairango_estabelecimentos WHERE ativo = 1`;
    db.all(sql, [], (err, estabelecimentos) => {
        if (err) {
            console.error('[UaiRango Service] Erro ao buscar estabelecimentos:', err.message);
            return;
        }

        if (!estabelecimentos || estabelecimentos.length === 0) {
            console.log('[UaiRango Service] Nenhum estabelecimento ativo para verificação.');
            return;
        }

        // 2. Para cada estabelecimento, inicia o processo de verificação.
        estabelecimentos.forEach(est => {
            console.log(`[UaiRango Service] Verificando para: ${est.nome_estabelecimento} (ID: ${est.id_estabelecimento})`);
            // Lógica para buscar pedidos para 'est' virá aqui na próxima etapa.
            // Ex: processEstablishment(est);
        });
    });
}


/**
 * Inicia o serviço de polling (busca periódica).
 * @param {number} intervalInMinutes - O intervalo em minutos para verificar novos pedidos.
 */
function startPolling(intervalInMinutes = 1) {
    console.log(`[UaiRango Service] Serviço de busca de pedidos iniciado. Verificando a cada ${intervalInMinutes} minuto(s).`);
    
    // Limpa qualquer intervalo anterior para evitar duplicação
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }

    // Executa a primeira verificação imediatamente
    checkForNewOrders();

    // Define o intervalo para verificações futuras
    const intervalInMs = intervalInMinutes * 60 * 1000;
    pollingInterval = setInterval(checkForNewOrders, intervalInMs);
}

/**
 * Para o serviço de polling.
 */
function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        console.log('[UaiRango Service] Serviço de busca de pedidos parado.');
    }
}

module.exports = {
    startPolling,
    stopPolling,
};
