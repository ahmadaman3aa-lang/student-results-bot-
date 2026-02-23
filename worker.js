// Student Results Bot - Cloudflare Worker
export default {
  async fetch(request, env) {
    // Handle different request types
    const url = new URL(request.url);
    
    // Handle Telegram webhook (POST requests)
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        await this.handleUpdate(update, env);
        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Error:', error);
        return new Response('Error', { status: 500 });
      }
    }
    
    // Handle webhook setup (GET requests)
    if (request.method === 'GET' && url.pathname === '/setup') {
      return await this.setupWebhook(env);
    }
    
    // Default response
    return new Response('Student Results Bot is running! Send /setup to configure webhook.');
  },

  async handleUpdate(update, env) {
    if (!update.message) return;
    
    const chatId = update.message.chat.id;
    const text = update.message.text || '';
    
    if (text === '/start') {
      await this.sendMessage(env, chatId, 
        "🎓 Welcome to Student Results Bot!\n\nSend your admission number to check results.\nExample: 2024001"
      );
      return;
    }
    
    if (!text.startsWith('/')) {
      await this.handleAdmission(env, chatId, text.trim());
    }
  },

  async handleAdmission(env, chatId, admissionNo) {
    try {
      await this.sendChatAction(env, chatId, 'typing');
      
      // Get student data from Google Sheets
      const student = await this.findStudent(env, admissionNo);
      
      if (!student) {
        await this.sendMessage(env, chatId, 
          `❌ No student found with admission number: ${admissionNo}`
        );
        return;
      }
      
      const message = this.formatResult(student);
      await this.sendMessage(env, chatId, message);
      
    } catch (error) {
      console.error('Error:', error);
      await this.sendMessage(env, chatId, "⚠️ Error processing request");
    }
  },

  async findStudent(env, admissionNo) {
    try {
      // Google Sheets API request
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/Sheet1!A:Z`;
      
      // Use API key for simplicity (easier than JWT)
      const response = await fetch(`${url}&key=${env.GOOGLE_API_KEY}`);
      const data = await response.json();
      
      if (!data.values || data.values.length < 2) return null;
      
      const headers = data.values[0];
      let admIndex = headers.findIndex(h => 
        h.toLowerCase().includes('admission') || 
        h.toLowerCase().includes('adm') ||
        h.toLowerCase().includes('roll')
      );
      
      if (admIndex === -1) admIndex = 0; // Assume first column is admission number
      
      for (let i = 1; i < data.values.length; i++) {
        const row = data.values[i];
        if (row[admIndex]?.toString() === admissionNo) {
          const student = {};
          headers.forEach((header, index) => {
            student[header] = row[index] || '';
          });
          return student;
        }
      }
      return null;
      
    } catch (error) {
      console.error('Sheets error:', error);
      return null;
    }
  },

  formatResult(student) {
    let message = `📊 **Student Results**\n\n`;
    message += `👤 **Name**: ${student.Name || 'N/A'}\n`;
    message += `🎫 **Admission**: ${student.Admission_No || student[Object.keys(student)[0]] || 'N/A'}\n`;
    message += `─`.repeat(20) + `\n`;
    
    for (const [key, value] of Object.entries(student)) {
      if (!['Name', 'Admission_No'].includes(key) && value && key !== '') {
        message += `📚 **${key}**: ${value}\n`;
      }
    }
    return message;
  },

  async sendMessage(env, chatId, text) {
    const url = `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: chatId, 
        text: text, 
        parse_mode: 'Markdown' 
      })
    });
  },

  async sendChatAction(env, chatId, action) {
    const url = `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendChatAction`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action })
    });
  },

  async setupWebhook(env) {
    // Get the worker URL
    const workerUrl = `https://${env.WORKER_URL || 'your-worker'}/`;
    
    const url = `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/setWebhook?url=${workerUrl}`;
    
    try {
      const response = await fetch(url);
      const result = await response.json();
      
      return new Response(JSON.stringify(result, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
};
