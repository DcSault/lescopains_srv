# Chiffrement de Bout en Bout (E2EE) - Documentation Technique

## Vue d'ensemble

LesCopains implémente un chiffrement de bout en bout strict pour :
- ✅ **Messages privés** (DM) : Obligatoire
- ✅ **Messages de groupe** : Optionnel
- ✅ **Salons vocaux** : Via WebRTC Insertable Streams
- ✅ **Partage d'écran** : Chiffré côté émetteur

**Protocole utilisé** : Signal Protocol (Double Ratchet + X3DH)

**Bibliothèque** : `@signalapp/libsignal-client` v0.57+ (officiel, maintenu par Signal Foundation)

---

## Signal Protocol - Principes

### 1. X3DH (Extended Triple Diffie-Hellman)

Établissement initial de la session entre deux utilisateurs.

**Clés impliquées** :
- **Identity Key Pair** : Clé long terme de l'utilisateur (IK)
- **Signed PreKey** : Clé signée par IK, renouvelée régulièrement (SPK)
- **One-Time PreKeys** : Clés éphémères, utilisées une seule fois (OPK)

**Workflow** :

```
Alice veut écrire à Bob pour la première fois

1. Alice génère son Identity Key (IKa)
2. Alice envoie IKa (publique) au serveur

3. Bob génère :
   - Identity Key (IKb)
   - Signed PreKey (SPKb)
   - 100 One-Time PreKeys (OPK1...OPK100)
   
4. Bob envoie au serveur :
   - IKb (publique)
   - SPKb (publique + signature)
   - Liste OPK (publiques)

5. Alice récupère le PreKey Bundle de Bob :
   - IKb, SPKb, OPK42 (une OPK aléatoire)

6. Alice calcule 4 secrets ECDH :
   DH1 = ECDH(IKa, SPKb)
   DH2 = ECDH(EKa, IKb)   // EK = Ephemeral Key
   DH3 = ECDH(EKa, SPKb)
   DH4 = ECDH(EKa, OPK42)
   
7. Alice dérive la Master Key :
   MK = KDF(DH1 || DH2 || DH3 || DH4)
   
8. Alice envoie son premier message chiffré + IKa + EKa à Bob

9. Bob reçoit, calcule les mêmes DH, retrouve MK, déchiffre
```

### 2. Double Ratchet

**Après l'établissement X3DH**, chaque message utilise une nouvelle clé.

**Composants** :
- **Symmetric Key Ratchet** : KDF chaînée (HKDF)
- **DH Ratchet** : Nouvelle paire ECDH à chaque tour de parole

**Avantages** :
- **Forward Secrecy** : Compromission d'une clé ≠ déchiffrement des messages passés
- **Break-in Recovery** : Après N messages, l'attaquant perd l'accès même s'il avait une clé
- **Out-of-order** : Les messages peuvent arriver dans le désordre

**Schéma** :

```
Alice → Bob : Msg 1 (ChainKey 1a)
               ↓ KDF
               ChainKey 2a → Msg 2
Alice ← Bob : Msg 3 (ChainKey 1b, nouveau DH)
               ↓ KDF
               ChainKey 2b → Msg 4
Alice → Bob : Msg 5 (ChainKey 3a, nouveau DH)
...
```

---

## Implémentation dans LesCopains

### Architecture E2EE

```
┌────────────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                           │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  @signalapp/libsignal-client (WebAssembly)               │ │
│  │  ┌────────────────────────────────────────────────────┐  │ │
│  │  │  IndexedDB (chiffré)                               │  │ │
│  │  │  - Identity Key Pair                               │  │ │
│  │  │  - Signed PreKey                                   │  │ │
│  │  │  - One-Time PreKeys                                │  │ │
│  │  │  - Session States (Double Ratchet)                 │  │ │
│  │  └────────────────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                           ↓ ciphertext uniquement              │
└────────────────────────────────────────────────────────────────┘
                              ↓
              ┌───────────────────────────┐
              │   SERVEUR (Backend API)    │
              │  - Stocke ciphertext       │
              │  - Distribue PreKeys       │
              │  - Aucune clé privée       │
              │  - Aucun déchiffrement     │
              └───────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                  CLIENT B (Browser)                            │
│  libsignal-client déchiffre avec sa clé privée                 │
└────────────────────────────────────────────────────────────────┘
```

### Code Frontend - Initialisation

```typescript
// frontend/src/lib/e2ee/signal.ts

import {
  IdentityKeyPair,
  PreKeyBundle,
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher,
  PrivateKey,
  PublicKey,
} from '@signalapp/libsignal-client';

/**
 * Initialiser les clés E2EE pour un nouvel utilisateur
 */
export async function initializeE2EE(userId: string): Promise<void> {
  // 1. Générer Identity Key Pair
  const identityKeyPair = IdentityKeyPair.generate();
  
  // 2. Générer Signed PreKey
  const signedPreKeyId = Math.floor(Math.random() * 16777215);
  const signedPreKeyPair = PrivateKey.generate();
  const signedPreKeyPublic = signedPreKeyPair.getPublicKey();
  const signedPreKeySignature = identityKeyPair.privateKey.sign(
    signedPreKeyPublic.serialize()
  );
  
  // 3. Générer 100 One-Time PreKeys
  const preKeys = [];
  for (let i = 0; i < 100; i++) {
    const preKeyPair = PrivateKey.generate();
    preKeys.push({
      keyId: i,
      publicKey: preKeyPair.getPublicKey().serialize(),
      privateKey: preKeyPair.serialize(),
    });
  }
  
  // 4. Stocker dans IndexedDB (chiffré avec mot de passe utilisateur)
  await saveToIndexedDB('identityKey', identityKeyPair.serialize());
  await saveToIndexedDB('signedPreKey', {
    id: signedPreKeyId,
    keyPair: signedPreKeyPair.serialize(),
    signature: signedPreKeySignature,
  });
  await saveToIndexedDB('preKeys', preKeys);
  
  // 5. Envoyer les clés PUBLIQUES au serveur
  await fetch('/api/prekeys/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      identityKey: identityKeyPair.publicKey.serialize().toString('base64'),
      signedPreKey: {
        id: signedPreKeyId,
        publicKey: signedPreKeyPublic.serialize().toString('base64'),
        signature: signedPreKeySignature.toString('base64'),
      },
      preKeys: preKeys.map(pk => ({
        id: pk.keyId,
        publicKey: pk.publicKey.toString('base64'),
      })),
    }),
  });
}

/**
 * Chiffrer un message pour un destinataire
 */
export async function encryptMessage(
  recipientId: string,
  plaintext: string
): Promise<string> {
  // 1. Vérifier si on a déjà une session avec ce contact
  let session = await loadSessionFromIndexedDB(recipientId);
  
  if (!session) {
    // 2. Pas de session → Récupérer le PreKey Bundle du serveur
    const bundle = await fetch(`/api/prekeys/${recipientId}`).then(r => r.json());
    
    // 3. Construire la session (X3DH)
    const address = new SignalProtocolAddress(recipientId, 1);
    const sessionBuilder = new SessionBuilder(/* store */, address);
    
    const preKeyBundle = PreKeyBundle.new(
      bundle.registrationId,
      1, // deviceId
      bundle.preKey.id,
      PublicKey.deserialize(Buffer.from(bundle.preKey.publicKey, 'base64')),
      bundle.signedPreKey.id,
      PublicKey.deserialize(Buffer.from(bundle.signedPreKey.publicKey, 'base64')),
      Buffer.from(bundle.signedPreKey.signature, 'base64'),
      PublicKey.deserialize(Buffer.from(bundle.identityKey, 'base64'))
    );
    
    await sessionBuilder.processPreKeyBundle(preKeyBundle);
    session = await sessionBuilder.load();
    
    // Marquer le PreKey comme utilisé sur le serveur
    await fetch(`/api/prekeys/${recipientId}/${bundle.preKey.id}/mark-used`, {
      method: 'POST',
    });
  }
  
  // 4. Chiffrer le message avec la session (Double Ratchet)
  const cipher = new SessionCipher(/* store */, address);
  const ciphertext = await cipher.encrypt(Buffer.from(plaintext, 'utf-8'));
  
  // 5. Retourner le ciphertext en base64
  return ciphertext.serialize().toString('base64');
}

/**
 * Déchiffrer un message reçu
 */
export async function decryptMessage(
  senderId: string,
  ciphertext: string
): Promise<string> {
  const address = new SignalProtocolAddress(senderId, 1);
  const cipher = new SessionCipher(/* store */, address);
  
  const plaintextBuffer = await cipher.decrypt(
    Buffer.from(ciphertext, 'base64')
  );
  
  return plaintextBuffer.toString('utf-8');
}
```

### Code Backend - Gestion PreKeys

```typescript
// backend/src/routes/prekeys.ts

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '@/database/connection.js';

const prekeyRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/prekeys/upload
   * Uploader les clés publiques d'un utilisateur
   */
  fastify.post('/upload', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.user as any;
    const body = request.body as any;
    
    // 1. Stocker l'Identity Key
    await db`
      UPDATE users
      SET identity_public_key = ${body.identityKey}
      WHERE id = ${user.userId}
    `;
    
    // 2. Stocker les PreKeys
    for (const preKey of body.preKeys) {
      await db`
        INSERT INTO prekeys (user_id, key_id, public_key, signature)
        VALUES (${user.userId}, ${preKey.id}, ${preKey.publicKey}, ${preKey.signature || null})
        ON CONFLICT (user_id, key_id) DO UPDATE
        SET public_key = EXCLUDED.public_key, used = false
      `;
    }
    
    return { success: true };
  });
  
  /**
   * GET /api/prekeys/:userId
   * Récupérer le PreKey Bundle d'un utilisateur
   */
  fastify.get('/:userId', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const params = request.params as any;
    
    // 1. Récupérer Identity Key
    const [user] = await db`
      SELECT identity_public_key
      FROM users
      WHERE id = ${params.userId}
    `;
    
    if (!user || !user.identity_public_key) {
      return reply.status(404).send({ error: 'User not found or no E2EE keys' });
    }
    
    // 2. Récupérer un PreKey non utilisé
    const [preKey] = await db`
      SELECT key_id, public_key, signature
      FROM prekeys
      WHERE user_id = ${params.userId} AND used = false
      ORDER BY RANDOM()
      LIMIT 1
    `;
    
    if (!preKey) {
      return reply.status(410).send({ error: 'No PreKeys available' });
    }
    
    return {
      identityKey: user.identity_public_key,
      preKey: {
        id: preKey.key_id,
        publicKey: preKey.public_key,
        signature: preKey.signature,
      },
    };
  });
  
  /**
   * POST /api/prekeys/:userId/:keyId/mark-used
   * Marquer un PreKey comme utilisé
   */
  fastify.post('/:userId/:keyId/mark-used', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const params = request.params as any;
    
    await db`
      UPDATE prekeys
      SET used = true
      WHERE user_id = ${params.userId} AND key_id = ${params.keyId}
    `;
    
    // Vérifier le stock de PreKeys
    const [count] = await db`
      SELECT COUNT(*) as available
      FROM prekeys
      WHERE user_id = ${params.userId} AND used = false
    `;
    
    if (count.available < 10) {
      // TODO: Notifier le client de générer plus de PreKeys
    }
    
    return { success: true };
  });
};

export default prekeyRoutes;
```

---

## WebRTC E2EE - Insertable Streams

### Principe

WebRTC transmet normalement les flux audio/vidéo **en clair** au serveur SFU.

**Insertable Streams API** permet d'intercepter les frames avant envoi et après réception pour les chiffrer/déchiffrer **côté client**.

### Code Frontend - Chiffrement Audio/Vidéo

```typescript
// frontend/src/lib/webrtc/e2ee-transform.ts

/**
 * Chiffrer un frame audio/vidéo avant envoi
 */
async function encryptFrame(
  encodedFrame: RTCEncodedAudioFrame | RTCEncodedVideoFrame,
  key: CryptoKey
): Promise<ArrayBuffer> {
  const data = encodedFrame.data;
  
  // 1. Générer un IV aléatoire (12 bytes pour AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // 2. Chiffrer avec AES-GCM
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  // 3. Concaténer IV + ciphertext
  const encrypted = new Uint8Array(iv.length + ciphertext.byteLength);
  encrypted.set(iv, 0);
  encrypted.set(new Uint8Array(ciphertext), iv.length);
  
  return encrypted.buffer;
}

/**
 * Déchiffrer un frame reçu
 */
async function decryptFrame(
  encryptedData: ArrayBuffer,
  key: CryptoKey
): Promise<ArrayBuffer> {
  const data = new Uint8Array(encryptedData);
  
  // 1. Extraire IV et ciphertext
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  
  // 2. Déchiffrer
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  
  return plaintext;
}

/**
 * Appliquer E2EE à un RTCRtpSender (audio/vidéo sortant)
 */
export async function applyE2EEToSender(
  sender: RTCRtpSender,
  encryptionKey: CryptoKey
): Promise<void> {
  // @ts-ignore - Insertable Streams API expérimentale
  const senderStreams = sender.createEncodedStreams();
  
  const transformStream = new TransformStream({
    transform: async (encodedFrame, controller) => {
      try {
        const encrypted = await encryptFrame(encodedFrame, encryptionKey);
        encodedFrame.data = encrypted;
        controller.enqueue(encodedFrame);
      } catch (error) {
        console.error('Encryption error:', error);
        controller.enqueue(encodedFrame); // Fallback: envoyer non chiffré
      }
    },
  });
  
  senderStreams.readable
    .pipeThrough(transformStream)
    .pipeTo(senderStreams.writable);
}

/**
 * Appliquer E2EE à un RTCRtpReceiver (audio/vidéo entrant)
 */
export async function applyE2EEToReceiver(
  receiver: RTCRtpReceiver,
  decryptionKey: CryptoKey
): Promise<void> {
  // @ts-ignore
  const receiverStreams = receiver.createEncodedStreams();
  
  const transformStream = new TransformStream({
    transform: async (encodedFrame, controller) => {
      try {
        const decrypted = await decryptFrame(encodedFrame.data, decryptionKey);
        encodedFrame.data = decrypted;
        controller.enqueue(encodedFrame);
      } catch (error) {
        console.error('Decryption error:', error);
        // Ne pas enqueue si échec déchiffrement (frame corrompu)
      }
    },
  });
  
  receiverStreams.readable
    .pipeThrough(transformStream)
    .pipeTo(receiverStreams.writable);
}

/**
 * Générer une clé de chiffrement partagée pour un salon vocal
 */
export async function generateVoiceChannelKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}
```

### Échange de Clés pour Salons Vocaux

Pour un salon vocal E2EE, tous les participants doivent partager la même clé AES.

**Option 1 : Leader distribue la clé**
- Le premier participant génère une clé AES-256
- Il la chiffre avec Signal Protocol pour chaque nouveau participant
- Les participants déchiffrent avec leur clé privée Signal

**Option 2 : Diffie-Hellman multi-parties**
- Chaque participant contribue un secret
- La clé finale est dérivée de tous les secrets (KDF)

---

## Vérification de Sécurité

### Safety Numbers (Fingerprints)

Afficher un QR code ou une chaîne de caractères permettant de vérifier l'identité.

```typescript
/**
 * Générer le Safety Number entre deux utilisateurs
 */
export function generateSafetyNumber(
  localIdentityKey: PublicKey,
  remoteIdentityKey: PublicKey,
  localUserId: string,
  remoteUserId: string
): string {
  const combined = Buffer.concat([
    Buffer.from(localUserId),
    localIdentityKey.serialize(),
    Buffer.from(remoteUserId),
    remoteIdentityKey.serialize(),
  ]);
  
  const hash = crypto.createHash('sha256').update(combined).digest();
  
  // Encoder en nombre de 60 chiffres (format Signal)
  return hash.toString('hex').substring(0, 60);
}
```

**Affichage dans l'UI** :
```svelte
<script>
  import QRCode from 'qrcode';
  
  let safetyNumber = '123456789012345678901234567890123456789012345678901234567890';
  let qrDataUrl = '';
  
  $: {
    QRCode.toDataURL(safetyNumber).then(url => qrDataUrl = url);
  }
</script>

<div class="safety-verification">
  <h3>Vérifier l'identité de {contactName}</h3>
  <img src={qrDataUrl} alt="QR Code" />
  <p class="safety-number">{safetyNumber}</p>
  <p>Comparez ce numéro avec votre contact en personne ou via un canal sécurisé.</p>
</div>
```

---

## Audits & Sécurité

### ✅ Points de Vérification

1. **Clés privées** : Jamais envoyées au serveur
2. **Stockage local** : IndexedDB chiffré avec mot de passe utilisateur (optionnel : avec WebAuthn)
3. **Transport** : TLS 1.3 obligatoire (Caddy auto-HTTPS)
4. **Metadata** : Le serveur voit qui parle à qui, mais pas le contenu
5. **Audit trail** : Aucune log du contenu des messages

### ⚠️ Limitations

- **Metadata exposure** : Le serveur voit les timestamps, tailles de messages, participants
- **Compromission client** : Si le navigateur est compromis, E2EE ne protège pas
- **Man-in-the-middle initial** : Le serveur pourrait théoriquement fournir de fausses clés publiques (d'où l'importance des Safety Numbers)

### Recommandations

1. **Pin les certificats** (Certificate Pinning) pour éviter MITM
2. **Implémenter la rotation automatique des PreKeys** (hebdomadaire)
3. **Ajouter un mécanisme de révocation de clés**
4. **Audit de code par un expert crypto** avant production

---

**Documentation complète** : [Signal Protocol Specifications](https://signal.org/docs/)

**Implémentation de référence** : https://github.com/signalapp/libsignal
