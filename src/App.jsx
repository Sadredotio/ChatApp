import React, { useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';
import './App.css';

function App() {
  // 1. Setup Room & Role synchronously to prevent "empty flashes"
  const [roomData] = useState(() => {
    let hash = window.location.hash.substring(1);
    let host = false;

    if (!hash) {
      // Creating a new room
      hash = 'chat_' + Math.random().toString(36).substring(2, 12);
      window.location.hash = hash;
      localStorage.setItem(`is_host_${hash}`, 'true');
      host = true;
    } else {
      // Joining an existing room, check if we are the owner
      host = localStorage.getItem(`is_host_${hash}`) === 'true';
    }
    return { roomId: hash, isHost: host };
  });

  // 2. Load messages instantly before the screen even draws
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem(`chat_history_${roomData.roomId}`);
    return saved ? JSON.parse(saved) : [];
  });

  const [status, setStatus] = useState('Initializing...');
  const [inputText, setInputText] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  const peerInstance = useRef(null);
  const connectionRef = useRef(null);
  const chatBoxRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]);

  // 3. BULLETPROOF SAVE: Overwrite memory every single time messages change
  useEffect(() => {
    localStorage.setItem(`chat_history_${roomData.roomId}`, JSON.stringify(messages));
  }, [messages, roomData.roomId]);

  // 4. Send queued ⏳ messages automatically when the connection opens
  useEffect(() => {
    if (isConnected && connectionRef.current) {
      const queued = messages.filter((m) => m.sender === 'me' && m.deliveryStatus === 'queued');
      if (queued.length > 0) {
        queued.forEach((msg) => {
          connectionRef.current.send({ ...msg, deliveryStatus: 'sent' });
        });
        // Update screen to show ✓ ticks
        setMessages((prev) =>
          prev.map((m) =>
            m.sender === 'me' && m.deliveryStatus === 'queued'
              ? { ...m, deliveryStatus: 'sent' }
              : m
          )
        );
      }
    }
  }, [isConnected]);

  // Handle PeerJS Connection
  useEffect(() => {
    const peer = new Peer(roomData.isHost ? roomData.roomId : undefined);
    peerInstance.current = peer;

    peer.on('open', () => {
      if (roomData.isHost) {
        setStatus('Room open! You can type now. Waiting for friend to join...');
      } else {
        setStatus('Connecting to friend...');
        const conn = peer.connect(roomData.roomId);
        setupConnection(conn);
      }
    });

    peer.on('connection', (conn) => {
      setupConnection(conn);
    });

    return () => {
      peer.destroy();
    };
  }, [roomData]);

  const setupConnection = (conn) => {
    connectionRef.current = conn;

    conn.on('open', () => {
      setIsConnected(true);
      setStatus('Connected securely!');
    });

    conn.on('data', (data) => {
      if (data.type === 'chat') {
        const incomingMsg = { ...data, sender: 'them' };
        setMessages((prev) => [...prev, incomingMsg]);
        conn.send({ type: 'read_receipt', messageId: data.id });
      } else if (data.type === 'read_receipt') {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === data.messageId ? { ...msg, deliveryStatus: 'read' } : msg
          )
        );
      }
    });

    conn.on('close', () => {
      setIsConnected(false);
      setStatus('Friend disconnected. New messages will queue locally.');
    });
  };

  const sendMessage = (text, imageBase64 = null) => {
    if (!text && !imageBase64) return;

    const newMsg = {
      type: 'chat',
      id: Math.random().toString(36).substring(2, 10),
      text: text,
      image: imageBase64,
      timestamp: Date.now(),
      sender: 'me',
      deliveryStatus: isConnected ? 'sent' : 'queued',
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputText('');

    if (isConnected && connectionRef.current) {
      connectionRef.current.send(newMsg);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target.result;
      sendMessage('', base64String);
    };
    reader.readAsDataURL(file);
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Link copied!');
  };

  const clearHistory = () => {
    if (window.confirm('Are you sure you want to clear this chat history?')) {
      setMessages([]); // Will instantly update localStorage to empty
    }
  };

  const renderTicks = (status) => {
    if (status === 'queued') return ' ⏳';
    if (status === 'sent') return ' ✓';
    if (status === 'read') return ' ✓✓';
    return '';
  };

  return (
    <div className="app-container">
      <header className="header">
        <h2>Sadre's Chat Room</h2>
        <div className="status-bar">{status}</div>
      </header>

      {!window.location.hash.substring(1) && !isConnected && (
        <div className="share-panel">
          <p>Share this link to connect:</p>
          <button onClick={copyLink}>Copy Invite Link</button>
        </div>
      )}

      <div className="chat-box" ref={chatBoxRef}>
        {messages.length === 0 && (
          <div className="status-bar" style={{ color: '#888', textAlign: 'center', marginTop: '20px' }}>
            No messages yet.
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`message-wrapper ${msg.sender}`}>
            <div className={`message-bubble ${msg.sender}`}>
              
              {msg.image && <img src={msg.image} alt="sent attachment" className="msg-image" />}
              {msg.text && <p className="msg-text">{msg.text}</p>}
              
              <div className="msg-meta">
                <span className="time">{formatTime(msg.timestamp)}</span>
                {msg.sender === 'me' && (
                  <span className={`read-tick ${msg.deliveryStatus}`}>
                    {renderTicks(msg.deliveryStatus)}
                  </span>
                )}
              </div>

            </div>
          </div>
        ))}
      </div>

      <footer className="footer">
        <button onClick={clearHistory} style={{ backgroundColor: '#e74c3c', padding: '10px', borderRadius: '50%' }} title="Clear History">
           🗑️
        </button>
        <label className="image-upload-btn">
          📷
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleImageUpload} 
            style={{ display: 'none' }} 
          />
        </label>
        
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage(inputText)}
          placeholder="Type a message..."
        />
        <button onClick={() => sendMessage(inputText)}>
          Send
        </button>
      </footer>
    </div>
  );
}

export default App;