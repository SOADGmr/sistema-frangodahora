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
        estoqueEsgotado: document.getElementById('estoque-esgotado-msg'),
    };

    // --- Estado do Aplicativo ---
    let state = {
        precoFrango: 0,
        tempoEntrega: 0,
        tempoRetirada: 0,
        taxasBairros: [],
        quantidade: 1,
        estoqueAtual: 0,
    };

    // --- Funções Auxiliares ---
    // ATUALIZADO: Adicionado headers para evitar cache, especialmente para a chamada de estoque
    const fetchJSON = async (url, options = {}) => {
        const defaultHeaders = {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Expires': '0',
        };

        const finalOptions = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...(options.headers || {}),
            },
        };

        try {
            const response = await fetch(url, finalOptions);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Erro de comunicação com o servidor.' }));
                throw new Error(errorData.error || 'Erro desconhecido.');
            }
            // Verifica se a resposta tem conteúdo antes de tentar converter para JSON
            const text = await response.text();
            return text ? JSON.parse(text) : {};
        } catch (error) {
            console.error(`Erro ao buscar dados de ${url}:`, error);
            if (url.includes('estoque')) return { quantidade_atual: 0 };
            return null;
        }
    };

    const formatarDinheiro = (valor) => {
        return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    // --- Lógica Principal ---
    const carregarDadosIniciais = async () => {
        const [precoData, tempoEntregaData, tempoRetiradaData, taxasData, estoqueData] = await Promise.all([
            fetchJSON(`${API_URL}/configuracoes/preco_frango`),
            fetchJSON(`${API_URL}/configuracoes/tempo_entrega`),
            fetchJSON(`${API_URL}/configuracoes/tempo_retirada`),
            fetchJSON(`${API_URL}/configuracoes/taxas`),
            fetchJSON(`${API_URL}/estoque`)
        ]);

        state.precoFrango = precoData && precoData.valor ? parseFloat(precoData.valor) : 50;
        state.tempoEntrega = tempoEntregaData && tempoEntregaData.valor ? parseInt(tempoEntregaData.valor, 10) : 60;
        state.tempoRetirada = tempoRetiradaData && tempoRetiradaData.valor ? parseInt(tempoRetiradaData.valor, 10) : 30;
        state.taxasBairros = taxasData || [];
        state.estoqueAtual = estoqueData && estoqueData.quantidade_atual ? estoqueData.quantidade_atual : 0;

        const bairroOptions = state.taxasBairros
            .map(b => `<option value="${b.bairro}">${b.bairro}</option>`)
            .join('');
        inputs.bairro.innerHTML += bairroOptions;
        
        atualizarTela();
    };

    const atualizarTela = () => {
        if (state.estoqueAtual <= 0) {
            form.style.display = 'none';
            displays.estoqueEsgotado.classList.remove('hidden');
            displays.tempoInfo.textContent = 'ESTOQUE ESGOTADO';
            displays.tempoInfo.style.fontWeight = 'bold';
            displays.tempoInfo.style.color = '#c53030';
            return;
        } else {
            form.style.display = 'block';
            displays.estoqueEsgotado.classList.add('hidden');
            displays.tempoInfo.style.fontWeight = 'normal';
            displays.tempoInfo.style.color = '#777';
        }

        const tipo = inputs.tipoPedido.value;
        let infoText = 'Selecione o tipo de pedido para ver o tempo médio.';
        if (tipo) {
            const tempo = tipo === 'Entrega' ? state.tempoEntrega : state.tempoRetirada;
            infoText = `Tempo médio para ${tipo.toLowerCase()}: ${tempo} min`;
        }
        displays.tempoInfo.textContent = `${infoText} | Estoque restante: ${state.estoqueAtual}`;
        
        const tipoSelecionado = tipo !== '';
        const nomePreenchido = inputs.nome.value.trim() !== '';
        const telefonePreenchido = inputs.telefone.value.trim() !== '';
        const enderecoPreenchido = inputs.endereco.value.trim() !== '';
        const bairroValido = inputs.bairro.value !== '';

        blocos[2].classList.toggle('visible', tipoSelecionado);

        if (tipoSelecionado && nomePreenchido && telefonePreenchido) {
            if (tipo === 'Entrega') {
                blocos[3].classList.add('visible');
                blocos[4].classList.toggle('visible', enderecoPreenchido && bairroValido);
            } else { // Retirada
                blocos[3].classList.remove('visible');
                blocos[4].classList.add('visible');
            }
        } else {
            blocos[3].classList.remove('visible');
            blocos[4].classList.remove('visible');
        }

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
        if (state.quantidade > state.estoqueAtual) {
            alert(`A quantidade solicitada (${state.quantidade}) é maior que nosso estoque atual (${state.estoqueAtual}). Por favor, ajuste a quantidade.`);
            return;
        }
        inputs.btnConcluir.disabled = true;
        inputs.btnConcluir.textContent = 'Enviando...';

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
            // Adiciona headers aqui também para garantir que a submissão não use cache
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
            inputs.btnConcluir.disabled = false;
            inputs.btnConcluir.textContent = 'Concluir Pedido';
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
        if ((state.quantidade + 1) <= state.estoqueAtual) {
            state.quantidade++;
            displays.quantidade.textContent = state.quantidade;
            calcularPrecoTotal();
        } else {
            alert(`A quantidade não pode exceder o estoque disponível de ${state.estoqueAtual} frango(s).`);
        }
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