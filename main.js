let web3;
let account;

let staking;
let oldToken;
let newToken;

async function connectWallet(){

if(window.ethereum){

web3 = new Web3(window.ethereum);

await ethereum.request({method:"eth_requestAccounts"});

const accounts = await web3.eth.getAccounts();

account = accounts[0];

document.getElementById("wallet").innerText = account;

staking = new web3.eth.Contract(stakingABI,contractAddress);

oldToken = new web3.eth.Contract(erc20ABI,oldTokenAddress);

newToken = new web3.eth.Contract(erc20ABI,newTokenAddress);

loadBalance();

loadStakes();

}

}


async function loadBalance(){

let bal = await newToken.methods.balanceOf(account).call();

bal = web3.utils.fromWei(bal);

document.getElementById("token").innerText = "KJC NEW";

document.getElementById("balance").innerText = bal;

}


async function approveAndStake(){

let bal = await newToken.methods.balanceOf(account).call();

await newToken.methods.approve(contractAddress,bal)
.send({from:account});

await staking.methods.stakeNew(bal)
.send({from:account});

alert("Stake success");

loadStakes();

}


async function loadStakes(){

const count = await staking.methods.getStakeCountNew(account).call();

let html="";

for(let i=0;i<count;i++){

const s = await staking.methods.stakesNew(account,i).call();

const amount = web3.utils.fromWei(s.amount);

html+=`
<p>
Stake ${i} : ${amount} KJC
<button onclick="unstake(${i})">Unstake</button>
</p>
`;

}

document.getElementById("stakes").innerHTML = html;

}


async function unstake(index){

await staking.methods.unstakeNew(index)
.send({from:account});

alert("Unstaked");

loadStakes();

}
