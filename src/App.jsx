import { useState, useEffect } from 'react';
import { db } from './firebase';
import { ref, onValue, push, remove, query, orderByChild } from 'firebase/database';
import './App.css';

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}時${m}分`;
}

function App() {
  const [name, setName] = useState('');
  const [members, setMembers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');

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
    await push(ref(db, 'members'), {
      name: trimmed,
      checkedInAt: Date.now(),
    });
    setName('');
  };

  const handleCheckOut = async (id) => {
    await remove(ref(db, `members/${id}`));
    setSelectedId(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleCheckIn();
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>モルックドーム</h1>
        <p className="subtitle">在室確認</p>
      </header>

      <section className="checkin-section">
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
          <button onClick={handleCheckIn} className="checkin-btn">
            チェックイン
          </button>
        </div>
        {error && <p className="error-msg">{error}</p>}
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
                className={`member-item ${selectedId === member.id ? 'selected' : ''}`}
                onClick={() =>
                  setSelectedId(selectedId === member.id ? null : member.id)
                }
              >
                <div className="member-info">
                  <span className="member-name">{member.name}</span>
                  <span className="member-time">
                    {formatTime(member.checkedInAt)}から滞在中
                  </span>
                </div>
                {selectedId === member.id && (
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
