
import express from 'express';
import {main} from './index.js';
const app= express();
import dotenv from 'dotenv';

dotenv.config();

async function startApp() {
    await main().catch((err) => {
        console.error('❌ Erreur fatale :', err);
        process.exit(1);
      });
}

app.get('/', (req,res)=>{
    res.status(200)
})

const PORT= process.env.PORT || 3000
app.listen(PORT,'0.0.0.0', ()=>{
    startApp()
      console.log(`serveur en ecoute sur le port ${PORT}`)
})