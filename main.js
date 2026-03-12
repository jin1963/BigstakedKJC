let web3;
let account = null;
let provider = null;

let staking;
let oldToken;
let newToken;

let isConnecting = false;
let isApproving = false;
let isStaking = false;

function pickProvider() {
  const bitkeep = window.bitkeep?.ethereum || window.bitkeep || null;
  const eth = window.ethereum || null;

  if (bitkeep?.request) return bitkeep;

  if (eth?.providers && Array.isArray(eth.providers)) {
    const bitgetProvider = eth.providers.find(
      (p) => p?.isBitKeep || p?.isBitgetWallet || p?.isBitget
    );
    if (bitgetProvider?.request) return bitgetProvider;

    const metaMaskProvider = eth.providers.find((p) => p?.isMetaMask);
    if (metaMaskProvider?.request) return metaMaskProvider;
  }

  if (eth?.request) return eth;
  return null;
}

function setWallet(text, ok = false) {
  const el = document.getElementById("wallet");
  if (!el) return;
  el.innerHTML = text;
  el.className = ok ? "wallet-box status-ok" : "wallet-box status-bad";
}

function setTokenInfo(tokenText, balanceText, allowanceText = "Allowance : -") {
  const tokenEl = document.getElementById("token");
  const balEl = document.getElementById("balance");
  const allowanceEl = document.getElementById("allowance");

  if (tokenEl) tokenEl.innerHTML = tokenText;
  if (balEl) balEl.innerHTML = balanceText;
  if (allowanceEl) allowanceEl.innerHTML = allowanceText;
}

function setButtonState(id, disabled, text = null) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = disabled;
  if (text !== null) btn.innerText = text;
}

function fmt(value, decimals = 18, maxFrac = 6) {
  const s = String(value || "0");
  const padded = s.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, -decimals);
  let fracPart = padded.slice(-decimals).replace(/0+$/, "");
  if (fracPart.length > maxFrac) fracPart = fracPart.slice(0, maxFrac);
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

async function ensureChain() {
  if (!provider?.request) throw new Error("No provider");

  const currentChainId = await provider.request({ method: "eth_chainId" });
  const targetHex = "0x" + Number(chainId).toString(16);

  if (String(currentChainId).toLowerCase() === targetHex.toLowerCase()) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetHex }]
    });
  } catch (e) {
    if (e?.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: targetHex,
          chainName: "BNB Smart Chain",
          nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
          rpcUrls: ["https://bsc-dataseed.binance.org/"],
          blockExplorerUrls: ["https://bscscan.com/"]
        }]
      });

      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetHex }]
      });
      return;
    }

    throw e;
  }
}

async function initContracts() {
  web3 = new Web3(provider);
  staking = new web3.eth.Contract(stakingABI, contractAddress);
  oldToken = new web3.eth.Contract(erc20ABI, oldTokenAddress);
  newToken = new web3.eth.Contract(erc20ABI, newTokenAddress);
}

async function tryRestoreConnection() {
  try {
    if (!provider?.request) return;
    const accounts = await provider.request({ method: "eth_accounts" });
    if (accounts?.length) {
      account = accounts[0];
      await initContracts();
      setWallet("✅ Connected<br>" + account, true);
      await loadTokenPreview();
      await loadData();
      await updateButtons();
    }
  } catch (e) {
    console.error("tryRestoreConnection error:", e);
  }
}

async function initApp() {
  try {
    provider = pickProvider();

    if (!provider?.request) {
      setWallet("❌ ไม่พบ Wallet Provider<br>กรุณาเปิดผ่าน Bitget / MetaMask DApp Browser");
      return;
    }

    await initContracts();

    document.getElementById("btnConnect")?.addEventListener("click", connectWallet);
    document.getElementById("btnApprove")?.addEventListener("click", approveOnly);
    document.getElementById("btnStake")?.addEventListener("click", stakeOnly);

    provider.on?.("accountsChanged", async (accounts) => {
      try {
        if (accounts?.length) {
          account = accounts[0];
          setWallet("✅ Connected<br>" + account, true);
          await loadTokenPreview();
          await loadData();
          await updateButtons();
        } else {
          account = null;
          setWallet("❌ Wallet not connected");
          setTokenInfo("Token : -", "Balance : -", "Allowance : -");
          document.getElementById("stakes").innerHTML = "กรุณาเชื่อมต่อกระเป๋าก่อน";
          setButtonState("btnApprove", true, "Approve");
          setButtonState("btnStake", true, "Stake MAX");
        }
      } catch (e) {
        console.error("accountsChanged error:", e);
      }
    });

    provider.on?.("chainChanged", async () => {
      try {
        await initContracts();
        if (account) {
          await loadTokenPreview();
          await loadData();
          await updateButtons();
        }
      } catch (e) {
        console.error("chainChanged error:", e);
      }
    });

    await tryRestoreConnection();
  } catch (e) {
    console.error("initApp error:", e);
    setWallet("❌ Init failed: " + (e?.message || e));
  }
}

window.addEventListener("load", initApp);

async function connectWallet() {
  if (isConnecting) return;

  try {
    isConnecting = true;
    setButtonState("btnConnect", true, "Connecting...");

    provider = pickProvider();
    if (!provider?.request) throw new Error("No provider");

    await ensureChain();

    let accounts = await provider.request({ method: "eth_accounts" });
    if (!accounts || !accounts.length) {
      accounts = await provider.request({ method: "eth_requestAccounts" });
    }

    if (!accounts?.length) throw new Error("No account");

    account = accounts[0];
    await initContracts();

    setWallet("✅ Connected<br>" + account, true);
    await loadTokenPreview();
    await loadData();
    await updateButtons();
  } catch (e) {
    console.error("connectWallet error:", e);

    let msg = e?.message || String(e);
    if (e?.code === 4001) msg = "ผู้ใช้ยกเลิกการเชื่อมต่อ";
    if (e?.code === -32002) msg = "มีหน้าต่าง Wallet ค้างอยู่ กรุณาเปิด Wallet แล้วกดยืนยัน";

    setWallet("❌ Connect failed");
    alert("Connect failed: " + msg);
  } finally {
    isConnecting = false;
    setButtonState("btnConnect", false, "Connect Wallet");
  }
}

async function getPickedTokenState() {
  if (!account) return null;

  const balanceNew = await newToken.methods.balanceOf(account).call();
  const balanceOld = await oldToken.methods.balanceOf(account).call();

  if (web3.utils.toBN(balanceNew).gt(web3.utils.toBN("0"))) {
    const allowance = await newToken.methods.allowance(account, contractAddress).call();
    return {
      label: "KJC NEW",
      token: newToken,
      balance: balanceNew,
      allowance,
      stakeMethod: "stakeNew"
    };
  }

  if (web3.utils.toBN(balanceOld).gt(web3.utils.toBN("0"))) {
    const allowance = await oldToken.methods.allowance(account, contractAddress).call();
    return {
      label: "KJC OLD",
      token: oldToken,
      balance: balanceOld,
      allowance,
      stakeMethod: "stakeOld"
    };
  }

  return null;
}

function getUseAmount(balanceStr) {
  const balanceBN = web3.utils.toBN(balanceStr);
  return balanceBN.mul(web3.utils.toBN(999)).div(web3.utils.toBN(1000)); // 99.9%
}

async function loadTokenPreview() {
  try {
    if (!account) {
      setTokenInfo("Token : -", "Balance : -", "Allowance : -");
      return;
    }

    const picked = await getPickedTokenState();

    if (!picked) {
      setTokenInfo("Token : ไม่พบ KJC", "Balance : 0", "Allowance : 0");
      return;
    }

    setTokenInfo(
      "Token : " + picked.label,
      "Balance : " + fmt(picked.balance) + " KJC",
      "Allowance : " + fmt(picked.allowance) + " KJC"
    );
  } catch (e) {
    console.error("loadTokenPreview error:", e);
  }
}

async function updateButtons() {
  try {
    if (!account) {
      setButtonState("btnApprove", true, "Approve");
      setButtonState("btnStake", true, "Stake MAX");
      return;
    }

    const picked = await getPickedTokenState();

    if (!picked) {
      setButtonState("btnApprove", true, "No KJC Found");
      setButtonState("btnStake", true, "Stake MAX");
      return;
    }

    const useAmountBN = getUseAmount(picked.balance);
    const allowanceBN = web3.utils.toBN(picked.allowance);

    setButtonState("btnApprove", false, "Approve " + picked.label);

    if (allowanceBN.lt(useAmountBN)) {
      setButtonState("btnStake", true, "Stake MAX " + picked.label);
    } else {
      setButtonState("btnStake", false, "Stake MAX " + picked.label);
    }
  } catch (e) {
    console.error("updateButtons error:", e);
  }
}

async function approveOnly() {
  if (isApproving) return;

  try {
    if (!account) {
      alert("กรุณาเชื่อมต่อกระเป๋าก่อน");
      return;
    }

    isApproving = true;
    setButtonState("btnApprove", true, "Approving...");

    await ensureChain();

    const picked = await getPickedTokenState();
    if (!picked) {
      alert("ไม่พบยอด KJC เก่าหรือใหม่ในกระเป๋า");
      return;
    }

    const useAmountBN = getUseAmount(picked.balance);
    if (useAmountBN.lte(web3.utils.toBN("0"))) {
      alert("ยอดเหรียญไม่พอสำหรับ approve");
      return;
    }

    await picked.token.methods
      .approve(contractAddress, useAmountBN.toString())
      .send({ from: account });

    alert("✅ Approve สำเร็จ");
    await loadTokenPreview();
    await updateButtons();
  } catch (e) {
    console.error("approveOnly error:", e);

    let msg = e?.message || String(e);
    if (e?.code === 4001) msg = "ผู้ใช้ยกเลิก approve";
    alert("Approve failed: " + msg);
  } finally {
    isApproving = false;
    await updateButtons();
  }
}

async function stakeOnly() {
  if (isStaking) return;

  try {
    if (!account) {
      alert("กรุณาเชื่อมต่อกระเป๋าก่อน");
      return;
    }

    isStaking = true;
    setButtonState("btnStake", true, "Staking...");

    await ensureChain();

    const picked = await getPickedTokenState();
    if (!picked) {
      alert("ไม่พบยอด KJC เก่าหรือใหม่ในกระเป๋า");
      return;
    }

    const useAmountBN = getUseAmount(picked.balance);
    const allowanceBN = web3.utils.toBN(picked.allowance);

    if (useAmountBN.lte(web3.utils.toBN("0"))) {
      alert("ยอดเหรียญไม่พอสำหรับ stake");
      return;
    }

    if (allowanceBN.lt(useAmountBN)) {
      alert("Allowance ยังไม่พอ กรุณากด Approve ก่อน");
      return;
    }

    const tx = await staking.methods[picked.stakeMethod](useAmountBN.toString()).send({ from: account });
    console.log("stake tx:", tx);

    alert("✅ Stake สำเร็จ");
    await loadTokenPreview();
    await loadData();
    await updateButtons();
  } catch (e) {
    console.error("stakeOnly error:", e);

    let msg = e?.message || String(e);
    if (e?.code === 4001) msg = "ผู้ใช้ยกเลิก stake";
    alert("Stake failed: " + msg);
  } finally {
    isStaking = false;
    await updateButtons();
  }
}

async function loadData() {
  const stakesDiv = document.getElementById("stakes");
  stakesDiv.innerHTML = "Loading...";

  if (!account || !staking) {
    stakesDiv.innerHTML = "Connect wallet first";
    return;
  }

  try {
    const countNew = Number(await staking.methods.getStakeCountNew(account).call());
    const countOld = Number(await staking.methods.getStakeCountOld(account).call());

    let html = "";

    for (let i = 0; i < countNew; i++) {
      const stake = await staking.methods.stakesNew(account, i).call();
      const unlock = await staking.methods.isUnlockedNew(account, i).call();
      const payout = await staking.methods.maturedPayoutNew(account, i).call();
      const unlockTime = await staking.methods.unlockTimeNew(account, i).call();

      html += `
        <div class="stake-box">
          <b>NEW Stake ${i}</b><br>
          Amount: ${fmt(stake.amount)} KJC<br>
          Reward: ${fmt(payout.reward)} KJC<br>
          Total: ${fmt(payout.total)} KJC<br>
          Unlock Time: ${new Date(Number(unlockTime) * 1000).toLocaleString("th-TH")}<br>
          Unlocked: ${unlock ? "Yes" : "No"}<br>
          ${unlock && !stake.unstaked ? `<button onclick="unstakeNew(${i})">Unstake</button>` : ""}
        </div>
      `;
    }

    for (let i = 0; i < countOld; i++) {
      const stake = await staking.methods.stakesOld(account, i).call();
      const unlock = await staking.methods.isUnlockedOld(account, i).call();
      const payout = await staking.methods.maturedPayoutOld(account, i).call();
      const unlockTime = await staking.methods.unlockTimeOld(account, i).call();

      html += `
        <div class="stake-box">
          <b>OLD Stake ${i}</b><br>
          Amount: ${fmt(stake.amount)} KJC<br>
          Reward: ${fmt(payout.reward)} KJC<br>
          Total: ${fmt(payout.total)} KJC<br>
          Unlock Time: ${new Date(Number(unlockTime) * 1000).toLocaleString("th-TH")}<br>
          Unlocked: ${unlock ? "Yes" : "No"}<br>
          ${unlock && !stake.unstaked ? `<button onclick="unstakeOld(${i})">Unstake</button>` : ""}
        </div>
      `;
    }

    stakesDiv.innerHTML = html || "No stakes";
  } catch (e) {
    console.error("loadData error:", e);
    stakesDiv.innerHTML = "Load failed";
  }
}

async function unstakeNew(i) {
  try {
    await ensureChain();
    await staking.methods.unstakeNew(i).send({ from: account });
    alert("Withdraw NEW success");
    await loadTokenPreview();
    await loadData();
    await updateButtons();
  } catch (e) {
    console.error("unstakeNew error:", e);
    alert("Unstake NEW failed: " + (e?.message || e));
  }
}

async function unstakeOld(i) {
  try {
    await ensureChain();
    await staking.methods.unstakeOld(i).send({ from: account });
    alert("Withdraw OLD success");
    await loadTokenPreview();
    await loadData();
    await updateButtons();
  } catch (e) {
    console.error("unstakeOld error:", e);
    alert("Unstake OLD failed: " + (e?.message || e));
  }
}
