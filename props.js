// ── PLAYER PROPS ──────────────────────────────────────────────
// Uses the actual ESPN game ID from currentGame, supports up to 6 players

function getPropsGameId() {
  if (window.currentGame && window.currentGame.id) return window.currentGame.id;
  return null;
}

// Toggle setup form
window.togglePropsSetup = function() {
  var f = document.getElementById("propsSetupForm");
  if (!f) return;
  if (!window.currentGame) { alert("Select a game first"); return; }
  f.style.display = f.style.display === "none" ? "block" : "none";
};

// Add a single player props board
window.addPlayerProp = function() {
  var gid = getPropsGameId();
  if (!gid) { alert("Select a game first"); return; }
  var name = document.getElementById("propsPlayerName").value.trim();
  var side = document.getElementById("propsPlayerSide").value;
  var price = parseFloat(document.getElementById("propsPrice").value) || 5;
  var pin = document.getElementById("propsPin").value;
  if (!name || !pin) { alert("Enter player name and admin PIN"); return; }

  fetch("/api/props/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      gameId: gid,
      homePlayer: side === "home" ? name : "",
      homeName: side === "home" ? name : "",
      awayPlayer: side !== "home" ? name : "",
      awayName: side !== "home" ? name : "",
      price: price,
      pin: pin
    })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (!d.ok) { alert(d.error || "Failed to create props board"); return; }
    document.getElementById("propsSetupForm").style.display = "none";
    document.getElementById("propsPlayerName").value = "";
    window._lp();
  }).catch(function(e) { alert("Error: " + e.message); });
};

// Claim a prop square (range button click)
window.claimPropSquare = function(side, idx, price) {
  var RANGES = ["0-9", "10-19", "20-29", "30-39", "40+"];
  var gid = getPropsGameId();
  if (!gid) { alert("Select a game first"); return; }
  var initials = prompt("Claim " + RANGES[idx] + " pts range for $" + price + "?\nEnter your initials (2-6 chars):");
  if (!initials || initials.trim().length < 2) return;

  fetch("/api/props/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameId: gid, side: side, rangeIdx: idx, owner: initials.trim() })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error) { alert(d.error); return; }
    window._lp();
  }).catch(function(e) { alert("Error: " + e.message); });
};

// Reset all props for current game
window.resetProps = function() {
  var gid = getPropsGameId();
  if (!gid) { alert("Select a game first"); return; }
  var pin = prompt("Enter admin PIN to reset ALL player props:");
  if (!pin) return;

  var sides = ["home", "away", "player3", "player4", "player5", "player6"];
  var promises = sides.map(function(side) {
    return fetch("/api/props/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: gid, side: side, pin: pin })
    }).then(function(r) { return r.json(); }).catch(function() { return {}; });
  });

  Promise.all(promises).then(function() {
    alert("Player props cleared!");
    window._lp();
  });
};

// Load and render all props boards for current game
window._lp = function() {
  var gid = getPropsGameId();
  var c = document.getElementById("propsBoardsContainer");
  if (!c) return;
  if (!gid) {
    c.innerHTML = '<div style="text-align:center;color:#444;font-size:12px;padding:20px 0">Select a game to view player props.</div>';
    return;
  }

  var sides = ["home", "away", "player3", "player4", "player5", "player6"];
  var fetches = sides.map(function(side) {
    return fetch("/api/props?gameId=" + encodeURIComponent(gid) + "&side=" + side)
      .then(function(r) { return r.json(); })
      .catch(function() { return { home: null, away: null }; });
  });

  // Fetch home and away (the API returns both in one call)
  fetch("/api/props?gameId=" + encodeURIComponent(gid))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (!d.home && !d.away) {
        c.innerHTML = '<div style="text-align:center;color:#444;font-size:12px;padding:20px 0">No props set up yet.<br>Click + Add Player to create a board.</div>';
        return;
      }

      function renderBoard(data, side) {
        if (!data) return "";
        var p = data.price || 5;
        var sold = data.squares.filter(function(s) { return s.owner; }).length;
        var html = '<div style="margin-bottom:14px">';
        html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px">';
        html += '<span style="font-size:13px;font-weight:800;color:#fff">' + data.name + '</span>';
        html += '<span style="font-size:10px;color:#16a34a;font-weight:700">$' + p + '/sq · ' + sold + '/5 sold</span>';
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px">';
        data.squares.forEach(function(sq, i) {
          var claimed = !!sq.owner;
          var clickHandler = claimed ? "" : 'onclick="claimPropSquare(\'' + side + '\',' + i + ',' + p + ')"';
          html += '<div ' + clickHandler + ' style="';
          html += 'background:' + (claimed ? '#0f2d1a' : '#1a1a1a') + ';';
          html += 'border:1px solid ' + (claimed ? '#16a34a' : '#2a2a2a') + ';';
          html += 'border-radius:6px;padding:10px 4px;text-align:center;';
          html += 'cursor:' + (claimed ? 'default' : 'pointer') + ';';
          html += 'transition:all 0.15s;';
          html += '"';
          if (!claimed) html += ' onmouseover="this.style.borderColor=\'#16a34a\';this.style.background=\'#111\'" onmouseout="this.style.borderColor=\'#2a2a2a\';this.style.background=\'#1a1a1a\'"';
          html += '>';
          html += '<div style="font-size:9px;color:#888;font-weight:700;margin-bottom:2px">' + sq.range + '</div>';
          html += '<div style="font-size:13px;font-weight:800;color:' + (claimed ? '#22c55e' : '#555') + '">' + (sq.owner || 'OPEN') + '</div>';
          if (!claimed) html += '<div style="font-size:8px;color:#16a34a;margin-top:2px">$' + p + '</div>';
          html += '</div>';
        });
        html += '</div></div>';
        return html;
      }

      c.innerHTML = renderBoard(d.home, "home") + renderBoard(d.away, "away");
    })
    .catch(function(e) {
      console.error("Props load error:", e);
      c.innerHTML = '<div style="text-align:center;color:#ef4444;font-size:12px;padding:20px 0">Error loading props: ' + e.message + '</div>';
    });
};

// Auto-load props when page loads and poll every 30 seconds
document.addEventListener("DOMContentLoaded", function() {
  // Wait for game to load first, then load props
  setTimeout(function() { window._lp(); }, 3000);
  setInterval(window._lp, 30000);
});
