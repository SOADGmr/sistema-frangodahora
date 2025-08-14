document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api';

    // --- Elementos do DOM ---
    const form = document.getElementById('cliente-form');
    const blocos = {
        1: document.getElementById('bloco-1'),
        2: document.getElementById('bloco-2'),
        3: document.getElementById('bloco-3'),
        4: document.getElementById('bloco-4'),
    };
    const inputs = {
        tipoPedido: document.getElementById('tipo_pedido'),
        nome: document.getElementById('cliente_nome'),
        telefone: document.getElementById('cliente_telefone'),
        endereco: document.getElementById('cliente_endereco'),
        bairro: document.getElementById('cliente_bairro'),
        formaPagamento: document.getElementById('forma_pagamento'),
        btnAumentar: document.getElementById('btn-aumentar'),
        btnDiminuir: document.getElementById('btn-diminuir'),
        btnConcluir: document.getElementById('btn-concluir'),
    };
    const displays = {
        tempoInfo: document.getElementById('tempo-info'),
        bairroError: document.getElementById('bairro-error'),
        precoTotal: document.getElementById('preco_total'),
        successMessage: document.getElementById('success-message'),
        quantidade: document.getElementById('quantidade_display'),
    };

    // --- Estado do Aplicativo ---
    let state = {
        precoFrango: 0,
        tempoEntrega: 0,
        tempoRetirada: 0,
        taxasBairros: [],
        quantidade: 1,
    };

    // --- Funções Auxiliares ---
    const fetchJSON = async (url, options = {}) => {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error('Erro na comunicação com o servidor.');
            return response.json();
        } catch (error) {
            console.error(`Erro ao buscar dados de ${url}:`, error);
            return null;
        }
    };

    const formatarDinheiro = (valor) => {
        return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    // --- Lógica Principal ---
    const carregarDadosIniciais = async () => {
        const [precoData, tempoEntregaData, tempoRetiradaData, taxasData] = await Promise.all([
            fetchJSON(`${API_URL}/configuracoes/preco_frango`),
            fetchJSON(`${API_URL}/configuracoes/tempo_entrega`),
            fetchJSON(`${API_URL}/configuracoes/tempo_retirada`),
            fetchJSON(`${API_URL}/configuracoes/taxas`)
        ]);

        state.precoFrango = precoData ? parseFloat(precoData.valor) : 50;
        state.tempoEntrega = tempoEntregaData ? parseInt(tempoEntregaData.valor, 10) : 60;
        state.tempoRetirada = tempoRetiradaData ? parseInt(tempoRetiradaData.valor, 10) : 30;
        state.taxasBairros = taxasData || [];

        const bairroOptions = state.taxasBairros
            .map(b => `<option value="${b.bairro}">${b.bairro}</option>`)
            .join('');
        inputs.bairro.innerHTML += bairroOptions;
        
        atualizarTela();
    };

    const atualizarTela = () => {
        const tipo = inputs.tipoPedido.value;

        // Limpa a info de tempo se nada estiver selecionado
        if (!tipo) {
            displays.tempoInfo.textContent = 'Selecione o tipo de pedido para ver o tempo médio.';
        } else {
            const tempo = tipo === 'Entrega' ? state.tempoEntrega : state.tempoRetirada;
            displays.tempoInfo.textContent = `Tempo médio para ${tipo.toLowerCase()}: ${tempo} min`;
        }
        
        // Lógica de exibição dos blocos
        const tipoSelecionado = tipo !== '';
        const nomePreenchido = inputs.nome.value.trim() !== '';
        const telefonePreenchido = inputs.telefone.value.trim() !== '';
        const enderecoPreenchido = inputs.endereco.value.trim() !== '';
        const bairroValido = inputs.bairro.value !== '';

        blocos[2].classList.toggle('visible', tipoSelecionado);

        if (tipoSelecionado && nomePreenchido && telefonePreenchido) {
            if (tipo === 'Entrega') {
                blocos[3].classList.add('visible');
                if (enderecoPreenchido && bairroValido) {
                    blocos[4].classList.add('visible');
                } else {
                    blocos[4].classList.remove('visible');
                }
            } else { // Retirada
                blocos[3].classList.remove('visible');
                blocos[4].classList.add('visible');
            }
        } else {
            blocos[3].classList.remove('visible');
            blocos[4].classList.remove('visible');
        }

        // Habilita/Desabilita botão de concluir
        const podeConcluir = inputs.formaPagamento.value !== '';
        inputs.btnConcluir.disabled = !podeConcluir;

        calcularPrecoTotal();
    };

    const calcularPrecoTotal = () => {
        let total = state.quantidade * state.precoFrango;

        if (inputs.tipoPedido.value === 'Entrega' && inputs.bairro.value) {
            const bairroSelecionado = state.taxasBairros.find(b => b.bairro === inputs.bairro.value);
            if (bairroSelecionado) {
                total += parseFloat(bairroSelecionado.taxa);
            }
        }
        
        displays.precoTotal.textContent = formatarDinheiro(total);
        return total;
    };

    const submeterPedido = async (e) => {
        e.preventDefault();
        const dadosPedido = {
            cliente_nome: inputs.nome.value,
            cliente_telefone: inputs.telefone.value,
            quantidade_frangos: state.quantidade,
            meio_frango: 0,
            picado: 0,
            forma_pagamento: inputs.formaPagamento.value,
            preco_total: calcularPrecoTotal(),
        };

        if (inputs.tipoPedido.value === 'Retirada') {
            dadosPedido.canal_venda = 'Porta';
            dadosPedido.cliente_endereco = 'Retirada';
            dadosPedido.cliente_bairro = '';
            dadosPedido.taxa_entrega = 0;
            dadosPedido.tempo_previsto = state.tempoRetirada;
        } else {
            const bairroData = state.taxasBairros.find(b => b.bairro === inputs.bairro.value);
            dadosPedido.canal_venda = 'Telefone'; 
            dadosPedido.cliente_endereco = inputs.endereco.value;
            dadosPedido.cliente_bairro = bairroData.bairro;
            dadosPedido.taxa_entrega = parseFloat(bairroData.taxa);
            dadosPedido.tempo_previsto = state.tempoEntrega;
        }

        try {
            const resultado = await fetchJSON(`${API_URL}/pedidos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosPedido),
            });

            if (resultado && resultado.pedidoId) {
                form.classList.add('hidden');
                displays.successMessage.classList.remove('hidden');
            } else {
                throw new Error(resultado.error || 'Não foi possível registrar o pedido.');
            }
        } catch (error) {
            alert(`Erro ao enviar pedido: ${error.message}`);
        }
    };

    // --- Event Listeners ---
    [inputs.tipoPedido, inputs.bairro, inputs.formaPagamento].forEach(input => {
        input.addEventListener('change', atualizarTela);
    });

    [inputs.nome, inputs.telefone, inputs.endereco].forEach(input => {
        input.addEventListener('keyup', () => {
            setTimeout(atualizarTela, 200);
        });
    });

    inputs.btnAumentar.addEventListener('click', () => {
        state.quantidade++;
        displays.quantidade.textContent = state.quantidade;
        calcularPrecoTotal();
    });

    inputs.btnDiminuir.addEventListener('click', () => {
        if (state.quantidade > 1) {
            state.quantidade--;
            displays.quantidade.textContent = state.quantidade;
            calcularPrecoTotal();
        }
    });

    form.addEventListener('submit', submeterPedido);
    
    carregarDadosIniciais();
});
