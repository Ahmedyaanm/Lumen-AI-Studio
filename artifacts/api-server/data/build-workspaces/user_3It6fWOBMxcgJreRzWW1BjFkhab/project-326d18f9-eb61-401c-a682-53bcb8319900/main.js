import { pipeline } from '@xenova/transformers';

const promptEl = document.getElementById('prompt');
const generateBtn = document.getElementById('generate');
const outputEl = document.getElementById('output');

let model;

async function loadModel() {
  outputEl.textContent = 'Loading model...';
  model = await pipeline('text-generation', 'gpt2');
  outputEl.textContent = 'Model loaded. Ready to generate.';
}

generateBtn.addEventListener('click', async () => {
  const prompt = promptEl.value.trim();
  if (!prompt) {
    alert('Please enter a prompt.');
    return;
  }
  generateBtn.disabled = true;
  outputEl.textContent = 'Generating...';
  try {
    const result = await model(prompt, { max_new_tokens: 50 });
    outputEl.textContent = result[0].generated_text;
  } catch (err) {
    outputEl.textContent = 'Error: ' + err.message;
  }
  generateBtn.disabled = false;
});

loadModel();