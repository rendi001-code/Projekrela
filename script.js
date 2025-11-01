let currentUserId = null;

// Fungsi untuk menampilkan pesan
function displayMessage(message) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.innerHTML = `
    <p><strong>${message.senderId}:</strong> ${message.text}</p>
    ${message.file ? `<img src="${message.file}" alt="Attachment" width="100">` : ''}
    <button onclick="copyMessage('${message.text}')">Salin</button>
  `;
    messagesDiv.appendChild(messageDiv);
}

// Fungsi untuk menyalin pesan
function copyMessage(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Pesan berhasil disalin!');
    });
}

// Fungsi untuk memuat pesan
async function loadMessages() {
    const response = await fetch('/messages');
    const messages = await response.json();
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = ''; // Bersihkan pesan lama
    messages.forEach(message => displayMessage(message));
}

// Registrasi
document.getElementById('registerBtn').addEventListener('click', async () => {
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    const response = await fetch('/register', {
        method: 'POST',
        
