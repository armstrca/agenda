const API_BASE_URL = '/api';

// Get CSRF token from meta tag
const getCsrfToken = () => {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
  return csrfToken || '';
};

export async function saveTemplate(template) {
  try {
    const response = await fetch(`${API_BASE_URL}/page_templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken(),
      },
      body: JSON.stringify({ template }),
    });

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}