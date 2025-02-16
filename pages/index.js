import { useState, useEffect } from 'react';
import { Relay, generatePrivateKey, getPublicKey, signEvent } from 'nostr-tools';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import Head from 'next/head';

const RELAY_URL = "wss://relay.damus.io"; // Публічний Nostr-релей

// Ініціалізація бази даних SQLite
async function initDB() {
  const db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });
  await db.exec('CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY, content TEXT, pubkey TEXT)');
  return db;
}

export default function Home() {
  const [posts, setPosts] = useState([]);
  const [newPost, setNewPost] = useState('');

  // Завантаження постів з SQLite
  useEffect(() => {
    async function fetchPosts() {
      const db = await initDB();
      const allPosts = await db.all('SELECT * FROM posts ORDER BY id DESC');
      setPosts(allPosts);
    }
    fetchPosts();
  }, []);

  // Підписка на Nostr-події (kind 1 — пости)
  useEffect(() => {
    const relay = new Relay(RELAY_URL);
    relay.connect().then(() => {
      const sub = relay.sub([{ kinds: [1] }]);
      sub.on('event', (event) => {
        console.log('Отримано подію з Nostr:', event);
        setPosts((prevPosts) => {
          // Уникаємо дублікатів
          if (prevPosts.some(post => post.pubkey === event.pubkey && post.content === event.content)) {
            return prevPosts;
          }
          return [{ content: event.content, pubkey: event.pubkey }, ...prevPosts];
        });
      });
    });
    return () => {
      relay.close();
    };
  }, []);

  // Функція для публікації нового поста
  async function handlePost() {
    if (!newPost.trim()) return;
    
    const sk = generatePrivateKey();
    const pk = getPublicKey(sk);
    const event = {
      kind: 1,
      pubkey: pk,
      created_at: Math.floor(Date.now() / 1000),
      content: newPost,
      tags: []
    };
    event.id = event.created_at.toString();
    event.sig = signEvent(event, sk);
    
    // Відправка події в Nostr-релей
    const relay = new Relay(RELAY_URL);
    await relay.connect();
    await relay.publish(event);
    relay.close();
    
    // Збереження поста в SQLite
    const db = await initDB();
    await db.run('INSERT INTO posts (content, pubkey) VALUES (?, ?)', [newPost, pk]);
    setPosts([{ content: newPost, pubkey: pk }, ...posts]);
    setNewPost('');
  }

  return (
    <div className="container">
      <Head>
        <title>PaleoQuota</title>
      </Head>
      <main>
        <h1 className="title">PaleoQuota</h1>
        <div className="input-group">
          <textarea
            className="post-input"
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            placeholder="Що нового?"
          />
          <button className="post-button" onClick={handlePost}>Опублікувати</button>
        </div>
        <ul className="posts-list">
          {posts.map((post, index) => (
            <li key={index} className="post-item">
              <p className="post-content">{post.content}</p>
              <small className="post-pubkey">{post.pubkey}</small>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
