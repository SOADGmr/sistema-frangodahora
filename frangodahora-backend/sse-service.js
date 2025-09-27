// Lista para manter todos os clientes (navegadores) conectados.
let clients = [];

/**
 * Adiciona um novo cliente (conexão de navegador) à lista.
 * @param {object} client - O objeto de resposta (res) da requisição.
 */
function addClient(client) {
    clients.push(client);
    console.log(`[SSE] Cliente conectado. Total: ${clients.length}`);
}

/**
 * Remove um cliente da lista quando ele se desconecta.
 * @param {object} client - O objeto de resposta (res) da requisição.
 */
function removeClient(client) {
    clients = clients.filter(c => c !== client);
    console.log(`[SSE] Cliente desconectado. Total: ${clients.length}`);
}

/**
 * Envia um evento/mensagem para todos os clientes conectados.
 * @param {object} data - O dado a ser enviado, que será convertido para JSON.
 */
function sendEvent(data) {
    console.log(`[SSE] Enviando evento para ${clients.length} cliente(s):`, data);
    const sseFormattedData = `data: ${JSON.stringify(data)}\n\n`;
    clients.forEach(client => client.write(sseFormattedData));
}

module.exports = {
    addClient,
    removeClient,
    sendEvent
};
