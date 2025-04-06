import React from 'react';
import { RouterProvider } from '@tanstack/react-router';
import './styles/styles.css';

// Import the main router setup from main.tsx
import { router } from './main'; // Ensure this exports the router instance

<React.StrictMode>
  <RouterProvider router={router} />
</React.StrictMode>
