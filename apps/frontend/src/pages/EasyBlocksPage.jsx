import React from 'react';
import { EasyblocksEditor } from '@easyblocks/editor';
import { DummyBanner } from '../components/EasyBlocksComponents';
import { easyblocksConfig } from '../components/EasyBlocksEditor';
import { saveTemplate } from '../services/api';

const EasyBlocksPage = () => {
  const handleSave = async (template) => {
    try {
      await saveTemplate(template);
      // Handle successful save (e.g., show notification)
    } catch (error) {
      // Handle error (e.g., show error message)
    }
  };

  return (
    <div className="easyblocks-container">
      <h1>EasyBlocks Editor</h1>
      <EasyblocksEditor
        config={easyblocksConfig}
        components={{ DummyBanner }}
        onSave={handleSave}
      />
    </div>
  );
}

export default EasyBlocksPage;