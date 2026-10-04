# Demo Video Transcript: Scaffold-HBAR Agent & Machine Payments

---

### [0:00 – 0:30] Scene 1: Scaffolding & Setup

**(Screen: Clean terminal)**

"If you're building on Hedera, monetizing an API route with micropayments or letting an AI agent pay for resources has always been painful.

We built Scaffold-HBAR Machine Payments to fix that.

One command:

`npm create scaffold-hbar@latest -- --template CijeTheCreator/machine-payments`

Now, let's prepare our contracts and consensus topics:

`yarn script:prepare`

It checks our testnet balance, deploys the Vault and Agent Registry contracts, and spins up three HCS topics for real-time audit trails.

Zero secrets in git. No manual configuration. Done."

---

### [0:30 – 1:00] Scene 2: Agent Onboarding & Discovery

**(Screen: Browser at `localhost:3000/onboard`)**

"Now, the app.

Right out of the box, you get this onboarding portal for your agents.

Let's say we have an agent called `Research-Agent-01`. We'll give it a spend limit of 5 HBAR, and hit generate.

Look at this prompt:

*'Install the skill from localhost:3000/skill.md, then follow its instructions to onboard with claim code...'*

Copy it. Give it to the agent.

No private keys are ever shared. The agent uses Open Wallet Standard to generate its own keys locally, then trades that single-use claim code for access.

And over here on `/skill.md`—the agent reads this to know exactly what endpoints are available and how to pay."

---

### [1:00 – 1:35] Scene 3: Scaffolding a Paid Route

**(Screen: Terminal -> Code editor -> Browser `/skill.md`)**

"Now say you want to sell something. A new AI model, a dataset, whatever.

You don't write payment boilerplate. You just run:

`yarn script:make-route --name sentiment --price 0.5 --description "Real-time AI sentiment analysis" --trust`

Open the code.

Everything is already wrapped in three lines of middleware:
ERC-8004 agent identity, x402 payment negotiation, and our spend guard that directs revenue straight into the on-chain vault.

Now flip back to `/skill.md` and refresh.

Boom. Our sentiment route, price, and description are already published for any agent to discover."

---

### [1:35 – 2:10] Scene 4: Agent Invocation & Settlement

**(Screen: Terminal / Agent prompt interface)**

"So let's watch the agent actually buy it.

I tell the agent: *'Fetch market sentiment from /api/sentiment.'*

The agent already installed our skill. It calls the endpoint.

The server immediately returns an HTTP 402 challenge for 0.5 HBAR.

The agent checks its budget cap, signs the transfer transaction with its local key, and sends it right back in the header.

And just like that—payment settled, and the agent gets the response."

---

### [2:10 – 2:40] Scene 5: Spend Dashboard & Consensus Audit

**(Screen: Browser at `localhost:3000/dashboard` -> HashScan)**

"Now switch over to the dashboard.

This is set up right out of the box for the agent's owner.

You can see live spend, active agents, and real-time testnet balances pulled straight from the mirror node.

Down here is the payment our agent just made.

Click the HashScan link.

There's the transaction on Hedera testnet.

And over on the HCS spend audit topic, every single decision—allow, block, or escalate—is permanently recorded on consensus."

---

### [2:40 – 3:00] Scene 6: Offline Testing & Outro

**(Screen: Terminal)**

"One last thing.

`yarn test`

Every smart contract, spend guard policy, and payment flow runs 100% offline. No network required.

Scaffold your agent payments on Hedera today.

Thanks."
