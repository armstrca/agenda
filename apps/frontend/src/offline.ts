// frontend/src/offline.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistStore, persistReducer } from 'redux-persist';
import { createStore } from 'redux';
import rootReducer from './reducers'; // Adjust the import according to your project structure

const persistConfig = {
    key: 'root',
    storage: AsyncStorage,
    whitelist: ['drawings', 'documents']
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

const store = createStore(persistedReducer);
const persistor = persistStore(store);

export { store, persistor };