import { useState, useEffect, useRef } from 'react';
import { db, storage } from './firebase';
import { ref, onValue, push, remove, query, orderByChild } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import './App.css';

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}時${m}分`;
}

const CORRECT_PIN = '5050';

function App() {
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');
  const [members, setMembers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('pin') === CORRECT_PIN);
  const [pin, setPin] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const membersRef = query(ref(db, 'members'), orderByChild('checkedInAt'));
    const unsubscribe = onValue(membersRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setMembers([]);
        return;
      }
      const list = Object.entries(data).map(([id, value]) => ({
        id,
        ...value,
      }));
      list.sort((a, b) => a.checkedInAt - b.checkedInAt);
      setMembers(list);
    });
    return () => unsubscribe();
  }, []);

  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('写真は5MB以下にしてください');
      return;
    }
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const clearPhoto = () => {
    setPhoto(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCheckIn = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('名前を入力してください');
      return;
    }
    const duplicate = members.find(
      (m) => m.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setError('同じ名前の人がすでにチェックインしています');
      return;
    }
    setError('');
    setUploading(true);
    try {
      const entry = {
        name: trimmed,
        checkedInAt: Date.now(),
      };
      const trimmedMemo = memo.trim();
      if (trimmedMemo) {
        entry.memo = trimmedMemo;
      }
      if (photo) {
        const photoId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const photoRef = storageRef(storage, `photos/${photoId}`);
        await uploadBytes(photoRef, photo);
        entry.photoURL = await getDownloadURL(photoRef);
        entry.photoPath = `photos/${photoId}`;
      }
      await push(ref(db, 'members'), entry);
      setName('');
      setMemo('');
      clearPhoto();
    } finally {
      setUploading(false);
    }
  };

  const handleCheckOut = async (id) => {
    const member = members.find((m) => m.id === id);
    if (member?.photoPath) {
      try {
        await deleteObject(storageRef(storage, member.photoPath));
      } catch {
        // photo already deleted, ignore
      }
    }
    await remove(ref(db, `members/${id}`));
    setSelectedId(null);
  };

  const handleUnlock = () => {
    if (pin === CORRECT_PIN) {
      sessionStorage.setItem('pin', pin);
      setUnlocked(true);
      setPin('');
      setError('');
    } else {
      setError('PINが違います');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (!unlocked) {
        handleUnlock();
      } else {
        handleCheckIn();
      }
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>モルックドーム</h1>
        <p className="subtitle">在室確認</p>
      </header>

      <section className="checkin-section">
        {!unlocked ? (
          <>
            <div className="input-group">
              <input
                type="password"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                placeholder="PINを入力"
                className="name-input"
                maxLength={10}
                inputMode="numeric"
              />
              <button onClick={handleUnlock} className="checkin-btn">
                解除
              </button>
            </div>
            {error && <p className="error-msg">{error}</p>}
          </>
        ) : (
          <>
            <div className="input-group">
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                placeholder="名前を入力"
                className="name-input"
                maxLength={20}
              />
              <button onClick={handleCheckIn} className="checkin-btn" disabled={uploading}>
                {uploading ? '送信中...' : 'チェックイン'}
              </button>
            </div>
            <div className="photo-memo-row">
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="一言メモ（任意）"
                className="memo-input"
                maxLength={50}
              />
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={fileInputRef}
                onChange={handlePhotoSelect}
                className="file-input-hidden"
              />
              <button
                className="photo-btn"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                📷
              </button>
            </div>
            {photoPreview && (
              <div className="photo-preview">
                <img src={photoPreview} alt="プレビュー" />
                <button className="photo-remove-btn" onClick={clearPhoto}>✕</button>
              </div>
            )}
            {error && <p className="error-msg">{error}</p>}
          </>
        )}
      </section>

      <section className="members-section">
        <h2 className="members-title">
          現在の在室 <span className="count">{members.length}人</span>
        </h2>

        {members.length === 0 ? (
          <div className="empty-state">
            <p>今は誰もいません</p>
          </div>
        ) : (
          <ul className="members-list">
            {members.map((member) => (
              <li
                key={member.id}
                className={`member-item ${unlocked && selectedId === member.id ? 'selected' : ''}`}
                onClick={() =>
                  unlocked && setSelectedId(selectedId === member.id ? null : member.id)
                }
              >
                {member.photoURL && (
                  <img src={member.photoURL} alt="" className="member-photo" />
                )}
                <div className="member-info">
                  <span className="member-name">{member.name}</span>
                  {member.memo && (
                    <span className="member-memo">「{member.memo}」</span>
                  )}
                  <span className="member-time">
                    {formatTime(member.checkedInAt)}から滞在中
                  </span>
                </div>
                {unlocked && selectedId === member.id && (
                  <button
                    className="checkout-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCheckOut(member.id);
                    }}
                  >
                    帰る
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default App;
