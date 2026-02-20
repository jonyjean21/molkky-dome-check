import { useState, useEffect } from 'react';
import { db } from './firebase';
import { ref, onValue, push, remove, query, orderByChild, get, orderByValue } from 'firebase/database';
import './App.css';

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}時${m}分`;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${h}:${m}`;
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

const CORRECT_PIN = '5050';
const ADMIN_PIN = '505050';

function App() {
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');
  const [members, setMembers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('pin') === CORRECT_PIN);
  const [pin, setPin] = useState('');
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem('admin') === 'true');
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logError, setLogError] = useState('');

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

  const cleanOldLogs = async () => {
    const cutoff = Date.now() - THIRTY_DAYS;
    const logsRef = ref(db, 'logs');
    const snapshot = await get(logsRef);
    if (!snapshot.exists()) return;
    const data = snapshot.val();
    const deletePromises = Object.entries(data)
      .filter(([, v]) => v.timestamp < cutoff)
      .map(([id]) => remove(ref(db, `logs/${id}`)));
    await Promise.all(deletePromises);
  };

  const addLog = async (name, action) => {
    try {
      await push(ref(db, 'logs'), {
        name,
        action,
        timestamp: Date.now(),
      });
    } catch (e) {
      console.error('ログ書き込みエラー:', e);
    }
  };

  const loadLogs = async () => {
    setLogError('');
    try {
      await cleanOldLogs();
    } catch (e) {
      // ignore cleanup errors
    }
    try {
      const snapshot = await get(ref(db, 'logs'));
      if (!snapshot.exists()) {
        setLogs([]);
        return;
      }
      const data = snapshot.val();
      const list = Object.entries(data)
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => b.timestamp - a.timestamp);
      setLogs(list);
    } catch (e) {
      console.error('ログ読み込みエラー:', e);
      setLogError(e.message || 'ログの読み込みに失敗しました');
      setLogs([]);
    }
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
    const entry = {
      name: trimmed,
      checkedInAt: Date.now(),
    };
    const trimmedMemo = memo.trim();
    if (trimmedMemo) {
      entry.memo = trimmedMemo;
    }
    await push(ref(db, 'members'), entry);
    await addLog(trimmed, 'in');
    setName('');
    setMemo('');
  };

  const handleCheckOut = async (id) => {
    const member = members.find((m) => m.id === id);
    await remove(ref(db, `members/${id}`));
    if (member) {
      await addLog(member.name, 'out');
    }
    setSelectedId(null);
  };

  const handleUnlock = () => {
    if (pin === ADMIN_PIN) {
      sessionStorage.setItem('pin', CORRECT_PIN);
      sessionStorage.setItem('admin', 'true');
      setUnlocked(true);
      setIsAdmin(true);
      setPin('');
      setError('');
    } else if (pin === CORRECT_PIN) {
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
        <p className="description">
          PINを入力するとチェックイン・チェックアウトができます。
          <br />
          一度入力すればブラウザを閉じるまで有効です。
        </p>
        <p className="home-tip">
          <strong>ホーム画面に追加</strong>するとアプリのように使えます。
          <br />
          iPhone：共有ボタン → 「ホーム画面に追加」
          <br />
          Android：メニュー（︙）→ 「ホーム画面に追加」
        </p>
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
              <button onClick={handleCheckIn} className="checkin-btn">
                チェックイン
              </button>
            </div>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="一言メモ（任意）"
              className="memo-input"
              maxLength={50}
            />
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

      {isAdmin && (
        <section className="logs-section">
          <button
            className="logs-toggle-btn"
            onClick={() => {
              if (!showLogs) loadLogs();
              setShowLogs(!showLogs);
            }}
          >
            {showLogs ? '履歴を閉じる' : '利用履歴'}
          </button>
          {showLogs && (
            <div className="logs-list">
              {logError ? (
                <p className="error-msg">{logError}</p>
              ) : logs.length === 0 ? (
                <p className="logs-empty">履歴はありません</p>
              ) : (
                <ul>
                  {logs.map((log) => (
                    <li key={log.id} className="log-item">
                      <span className={`log-action ${log.action === 'in' ? 'log-in' : 'log-out'}`}>
                        {log.action === 'in' ? 'IN' : 'OUT'}
                      </span>
                      <span className="log-name">{log.name}</span>
                      <span className="log-time">{formatDate(log.timestamp)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      <footer className="footer">
        <p className="footer-url">
          このページのURL
          <br />
          <a href="https://jonyjean21.github.io/molkky-dome-check">jonyjean21.github.io/molkky-dome-check</a>
        </p>
      </footer>
    </div>
  );
}

export default App;
