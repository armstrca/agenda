import React from 'react';
import { EasyblocksEditor } from "@easyblocks/editor";
import { EasyblocksBackend } from "@easyblocks/core";

export const easyblocksConfig = {
  backend: new EasyblocksBackend({
    accessToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJwcm9qZWN0X2lkIjoiZTA4N2FhMjgtYzc5Mi00YmE2LWI2MGUtMzk2ZTdlMDU2ZGE1IiwianRpIjoiYzg2YjI0YjUtNGQ1OS00NjQzLWFlMTMtMDRjZGZjMGUyMGM1IiwiaWF0IjoxNzQyMTcyMTEyfQ.Xo79ypgP1dIrOwlefv63_F85lGmYJtg_xttm5NaqiAg',
  }),
  locales: [
    { code: 'en-US', isDefault: true },
    { code: 'de-DE', fallback: 'en-US' },
  ],
  components: [
    {
      id: 'DummyBanner',
      label: 'DummyBanner',
      schema: [
        {
          prop: 'backgroundColor',
          label: 'Background Color',
          type: 'color',
        },
        { prop: 'padding', label: 'Padding', type: 'space' },
        {
          prop: 'Title',
          type: 'component',
          required: true,
          accepts: ['@easyblocks/rich-text'],
        },
      ],
      styles: ({ values }) => ({
        styled: {
          Root: {
            backgroundColor: values.backgroundColor,
            padding: values.padding,
          },
        },
      }),
    },
  ],
  tokens: {
    colors: [
      { id: 'black', label: 'Black', value: '#000000', isDefault: true },
      { id: 'white', label: 'White', value: '#ffffff' },
      { id: 'coral', label: 'Coral', value: '#ff7f50' },
    ],
    fonts: [
      {
        id: 'body',
        label: 'Body',
        value: { fontSize: 18, lineHeight: 1.8, fontFamily: 'sans-serif' },
        isDefault: true,
      },
      {
        id: 'heading',
        label: 'Heading',
        value: {
          fontSize: 24,
          fontFamily: 'sans-serif',
          lineHeight: 1.2,
          fontWeight: 700,
        },
      },
    ],
    space: [
      { id: '0', label: '0', value: '0px', isDefault: true },
      // ... rest of space tokens
    ],
  },
  hideCloseButton: true,
};

// Create the component renderers
function TextBlock({ text, align }) {
  return (
    <div style={{ textAlign: align || "left" }}>
      <div dangerouslySetInnerHTML={{ __html: text }} />
    </div>
  );
}

// Export the editor component as default
const EasyBlocksEditor = () => {
  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <EasyblocksEditor
        config={easyblocksConfig}
        components={{ TextBlock }}
        rootComponent="TextBlock"
        onSave={onSave}
      />
    </div>
  );
};

// Make sure to export the component as default
export default EasyBlocksEditor;