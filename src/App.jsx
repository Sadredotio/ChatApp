import React, { useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';
import './App.css'; // Assuming basic styling

function App() {
  const [peerId, setPeerId] = useState('');
  const [status, setStatus] = useState('Initializing...');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  
  const peerInstance = useRef(null);
  const connectionRef = useRef(null);
  const chatBoxRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const roomHash = window.location.hash.substring(1);
    const peer = new Peer(roomHash ? undefined : 'chat_' + Math.random().toString(36).substring(2, 12));
    peerInstance.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
      if (!roomHash) {
        window.location.hash = id;
        setStatus('Waiting for friend to join via link...');
      } else {
        setStatus('Connecting to friend...');
        const conn = peer.connect(roomHash);
        setupConnection(conn);
      }
    });

    peer.on('connection', (conn) => {
      setupConnection(conn);
    });

    return () => {
      peer.destroy();
    };
  }, []);

  const setupConnection = (conn) => {
    connectionRef.current = conn;

    conn.on('open', () => {
      setIsConnected(true);
      setStatus('Connected securely!');
    });

    conn.on('data', (data) => {
      if (data.type === 'chat') {
        // 1. Receive incoming message
        const incomingMsg = { ...data, sender: 'them' };
        setMessages((prev) => [...prev, incomingMsg]);

        // 2. Send back a "Read Receipt" automatically
        conn.send({ type: 'read_receipt', messageId: data.id });
      } 
      else if (data.type === 'read_receipt') {
        // 3. Mark our outgoing message as read
        setMessages((prev) => 
          prev.map(msg => msg.id === data.messageId ? { ...msg, isRead: true } : msg)
        );
      }
    });

    conn.on('close', () => {
      setIsConnected(false);
      setStatus('Friend disconnected.');
    });
  };

  const sendMessage = (text, imageBase64 = null) => {
    if (!connectionRef.current || (!text && !imageBase64)) return;

    const newMsg = {
      type: 'chat',
      id: Math.random().toString(36).substring(2, 10), // Unique ID for read receipts
      text: text,
      image: imageBase64,
      timestamp: Date.now(),
      sender: 'me',
      isRead: false
    };

    // Send to friend
    connectionRef.current.send(newMsg);
    
    // Add to our screen
    setMessages((prev) => [...prev, newMsg]);
    setInputText('');
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target.result;
      sendMessage('', base64String); // Send image as base64
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

  return (
    <div className="app-container">
      <header className="header">
        <h2>React P2P Chat</h2>
        <div className="status-bar">{status}</div>
      </header>

      {!window.location.hash.substring(1) && !isConnected && (
        <div className="share-panel">
          <p>Share this link to connect:</p>
          <button onClick={copyLink}>Copy Invite Link</button>
        </div>
      )}

      <div className="chat-box" ref={chatBoxRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`message-wrapper ${msg.sender}`}>
            <div className={`message-bubble ${msg.sender}`}>
              
              {/* Render Image if exists */}
              {msg.image && <img src={msg.image} alt="sent attachment" className="msg-image" />}
              
              {/* Render Text if exists */}
              {msg.text && <p className="msg-text">{msg.text}</p>}
              
              <div className="msg-meta">
                <span className="time">{formatTime(msg.timestamp)}</span>
                {/* Read Receipt Logic */}
                {msg.sender === 'me' && (
                  <span className={`read-tick ${msg.isRead ? 'read' : 'sent'}`}>
                    {msg.isRead ? ' ✓✓' : ' ✓'}
                  </span>
                )}
              </div>

            </div>
          </div>
        ))}
      </div>

      <footer className="footer">
        <label className="image-upload-btn">
          📷
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleImageUpload} 
            disabled={!isConnected} 
            style={{ display: 'none' }} 
          />
        </label>
        
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage(inputText)}
          placeholder="Type a message..."
          disabled={!isConnected}
        />
        <button onClick={() => sendMessage(inputText)} disabled={!isConnected}>
          Send
        </button>
      </footer>
    </div>
  );
}

export default App;