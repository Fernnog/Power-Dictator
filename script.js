document.addEventListener('DOMContentLoaded', () => {
    const transcriptionArea = document.getElementById('transcriptionArea');
    const micBtn = document.getElementById('micBtn');
    const copyBtn = document.getElementById('copyBtn');

    // Verifica se o navegador suporta a Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Seu navegador não suporta a API de reconhecimento de voz. Tente usar o Chrome.");
        micBtn.disabled = true;
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR'; // Define o idioma
    recognition.interimResults = true; // Mostra resultados parciais
    recognition.continuous = true; // Continua escutando

    let isRecording = false;
    let finalTranscript = '';

    // Lógica do botão do microfone
    micBtn.addEventListener('click', () => {
        isRecording = !isRecording;
        if (isRecording) {
            finalTranscript = transcriptionArea.value; // Continua do texto existente
            recognition.start();
            micBtn.classList.add('recording');
            micBtn.querySelector('span').textContent = 'Parar';
        } else {
            recognition.stop();
            micBtn.classList.remove('recording');
            micBtn.querySelector('span').textContent = 'Gravar';
        }
    });

    // Evento que processa o resultado da fala
    recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        transcriptionArea.value = finalTranscript + interimTranscript;
    };

    // Reinicia o estado do botão quando a gravação termina
    recognition.onend = () => {
        isRecording = false;
        micBtn.classList.remove('recording');
        micBtn.querySelector('span').textContent = 'Gravar';
    };
    
    // Lógica do botão de copiar
    copyBtn.addEventListener('click', () => {
        if (transcriptionArea.value) {
            navigator.clipboard.writeText(transcriptionArea.value)
                .then(() => {
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = 'Copiado!';
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                    }, 2000); // Volta ao normal após 2 segundos
                })
                .catch(err => {
                    console.error('Falha ao copiar texto: ', err);
                    alert('Não foi possível copiar o texto.');
                });
        }
    });
});
