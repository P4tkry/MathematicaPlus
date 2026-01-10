// API functions for communicating with the server

export async function validateAccessToken(token: string): Promise<boolean> {
  const response = await fetch('https://ai-one.p4tkry.pl/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    return false;
  }

  return true;
}

export async function aiOneAnswer(token: string, model: string, content: string): Promise<string> {
  const response = await fetch('https://ai-one.p4tkry.pl/api/ai-one/simple', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, model, content }),
  });

  if (!response.ok) {
    throw new Error('AI one request failed');
  }

  const data = await response.json();
  return data.content;
}
