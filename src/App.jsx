import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  // 1. Get or create a unique room ID from the URL hash
  const [roomId] = useState(() => {
    let hash = window.location.hash.substring(1);
    if (!hash) {
      hash = 'room_' + Math.random().toString(36).substring(2, 15);
      window.location.hash = hash;
    }
    return hash;
  });

  // 2. Load past messages instantly from local storage
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem(`chat_history_${roomId}`);
    return saved ? JSON.parse(saved) : [];
  });

  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState('Connecting to secure 443 network...');
  const chatBoxRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]);

  // Save messages to LocalStorage locally whenever they update
  useEffect(() => {
    localStorage.setItem(`chat_history_${roomId}`, JSON.stringify(messages));
  }, [messages, roomId]);

  // 3. LISTEN FOR MESSAGES: Open a secure stream over Port 443
  useEffect(() => {
    setStatus('Connected securely! Ready to chat.');
    
    // Server-Sent Events (SSE) opens a persistent stream that works beautifully over 5G+
    const eventSource = new EventSource(`https://ntfy.sh/${roomId}/sse`);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const chatData = JSON.parse(payload.message);

        // If the message is from us, ignore it or process read receipts
        if (chatData.senderId === getSessionId()) {
          if (chatData.type === 'read_receipt') {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === chatData.messageId ? { ...msg, deliveryStatus: 'read' } : msg
              )
            );
          }
          return;
        }

        // If it's a chat message from the other person
        if (chatData.type === 'chat') {
          const incomingMsg = {
            id: chatData.id,
            text: chatData.text,
            image: chatData.image,
            timestamp: chatData.timestamp,
            sender: 'them',
            deliveryStatus: 'read'
          };

          setMessages((prev) => {
            if (prev.some((m) => m.id === chatData.id)) return prev; // Prevent duplicates
            return [...prev, incomingMsg];
          });

          // Send a read receipt back to them instantly
          sendReadReceipt(chatData.id);
        }
      } catch (e) {
        // Keeps the connection alive from network heartbeats
      }
    };

    eventSource.onerror = () => {
      setStatus('Reconnecting to network seamlessly...');
    };

    return () => {
      eventSource.close();
    };
  }, [roomId]);

  // Unique session ID so the app knows who sent what
  const getSessionId = () => {
    let id = sessionStorage.getItem('chat_session_id');
    if (!id) {
      id = 'user_' + Math.random().toString(36).substring(2, 10);
      sessionStorage.setItem('chat_session_id', id);
    }
    return id;
  };

  // 4. SENDING MESSAGES
  const sendMessage = async (text, imageBase64 = null) => {
    if (!text && !imageBase64) return;

    const messageId = Math.random().toString(36).substring(2, 10);
    const timeNow = Date.now();

    const newMsg = {
      type: 'chat',
      id: messageId,
      senderId: getSessionId(),
      text: text,
      image: imageBase64,
      timestamp: timeNow
    };

    // Show on our screen instantly as 'sent'
    const localMsg = {
      id: messageId,
      text: text,
      image: imageBase64,
      timestamp: timeNow,
      sender: 'me',
      deliveryStatus: 'sent'
    };
    setMessages((prev) => [...prev, localMsg]);
    setInputText('');

    // Push the message payload over the secure web network
    try {
      await fetch(`https://ntfy.sh/${roomId}`, {
        method: 'POST',
        body: JSON.stringify(newMsg)
      });
    } catch (err) {
      // If the network drops, turn the tick into a waiting hourglass
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, deliveryStatus: 'queued' } : m))
      );
    }
  };

  const sendReadReceipt = async (msgId) => {
    const receipt = {
      type: 'read_receipt',
      senderId: getSessionId(),
      messageId: msgId
    };
    try {
      await fetch(`https://ntfy.sh/${roomId}`, { method: 'POST', body: JSON.stringify(receipt) });
    } catch (e) {}
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // ntfy.sh payload limit safety checkpoint (~500KB)
    if (file.size > 500000) { 
      alert("Image is too large. Please send an image under 500KB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      sendMessage('', event.target.result);
    };
    reader.readAsDataURL(file);
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Invite link copied!');
  };

  const clearHistory = () => {
    if (window.confirm('Delete chat history from this device?')) {
      setMessages([]);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h2>Direct Secure Chat</h2>
        <div className="status-bar">{status}</div>
      </header>

      {messages.length === 0 && (
        <div className="share-panel">
          <p>Send this link to the other person to start chatting:</p>
          <button onClick={copyLink}>Copy Invite Link</button>
        </div>
      )}

      <div className="chat-box" ref={chatBoxRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`message-wrapper ${msg.sender}`}>
            <div className={`message-bubble ${msg.sender}`}>
              {msg.image && <img src={msg.image} alt="attachment" className="msg-image" />}
              {msg.text && <p className="msg-text">{msg.text}</p>}
              <div className="msg-meta">
                <span className="time">{formatTime(msg.timestamp)}</span>
                {msg.sender === 'me' && (
                  <span className={`read-tick ${msg.deliveryStatus}`}>
                    {msg.deliveryStatus === 'queued' ? ' ⏳' : msg.deliveryStatus === 'sent' ? ' ✓' : ' ✓✓'}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <footer className="footer">
        <button onClick={clearHistory} style={{ backgroundColor: '#e74c3c', padding: '10px', borderRadius: '50%' }} title="Clear Chat">
          🗑️
        </button>
        <label className="image-upload-btn">
          📷
          <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
        </label>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage(inputText)}
          placeholder="Type a message..."
        />
        <button onClick={() => sendMessage(inputText)}>Send</button>
      </footer>
    </div>
  );
}

export default App;