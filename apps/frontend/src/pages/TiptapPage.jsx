import React from 'react';
import Tiptap from '../components/Tiptap';

const TiptapPage = () => {
  // Create an array of 6 editors
  const editors = Array.from({ length: 6 }, (_, i) => (
    <div key={i} className="tiptap-container">
      <h3>Editor {i + 1}</h3>
      <Tiptap />
    </div>
  ));

  return (
    <div className="tiptap-page">
      <h1>Tiptap Editors</h1>
      <div className="editors-grid">
        {editors}
      </div>
    </div>
  );
}

export default TiptapPage;