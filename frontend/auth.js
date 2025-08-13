// /frontend/auth.js

/**
 * Verifica a autenticação e autorização do usuário.
 * Esta função deve ser chamada no início de cada página protegida.
 * * @param {string[]} allowedRoles - Um array com os cargos que podem acessar a página. Ex: ['Admin'], ['Moto'], ['Admin', 'Moto']
 */
function checkAuth(allowedRoles) {
    const usuarioLogadoJSON = sessionStorage.getItem('usuarioLogado');

    // 1. Verifica se existe um usuário na sessão
    if (!usuarioLogadoJSON) {
        // Se não houver, redireciona para o login, guardando a página que ele tentou acessar.
        window.location.href = `login.html?redirect=${window.location.pathname}`;
        return;
    }

    const usuario = JSON.parse(usuarioLogadoJSON);

    // 2. Verifica se o cargo do usuário está na lista de cargos permitidos
    if (!allowedRoles.includes(usuario.cargo)) {
        // Se não tiver permissão, informa o erro e redireciona para o login.
        alert('Você não tem permissão para acessar esta página.');
        sessionStorage.removeItem('usuarioLogado'); // Limpa a sessão inválida
        window.location.href = 'login.html';
        return;
    }

    // 3. Se tudo estiver correto, retorna os dados do usuário para uso na página.
    return usuario;
}

/**
 * Realiza o logout do usuário.
 * Limpa os dados da sessão e redireciona para a página de login.
 */
function logout() {
    sessionStorage.removeItem('usuarioLogado');
    window.location.href = 'login.html';
}

// Adiciona um listener global para o evento de "logout" que pode ser disparado de qualquer página
window.addEventListener('logout-request', logout);
