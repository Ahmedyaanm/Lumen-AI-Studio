document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('nameInput');
  const button = document.getElementById('greetBtn');
  const greeting = document.getElementById('greeting');

  button.addEventListener('click', () => {
    const name = input.value.trim();
    if (name) {
      greeting.textContent = `Hello, ${name}!`;
    } else {
      greeting.textContent = 'Please enter your name.';
    }
  });
});