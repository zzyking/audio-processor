// src/App.js
import React from 'react';
import './App.css';
import AudioProcessor from './AudioProcessor';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>FIR Filter Design and Implementation</h1>
        <AudioProcessor />
      </header>
    </div>
  );
}

export default App;
