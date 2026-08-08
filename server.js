//const express = require('express')
import express from 'express';
import {main} from './index.js';
const app= express();

async function startApp() {
    await main().catch((err) => {
        console.error('❌ Erreur fatale :', err);
        process.exit(1);
      });
}

app.get('/', (req,res)=>{
    res.status(200)
})

app.listen(3000, ()=>{
    startApp()
      console.log('serveur en ecoute sur http://localhost:3000/')
})