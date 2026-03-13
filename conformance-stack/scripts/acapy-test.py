#!/usr/bin/env python3
import subprocess
import asyncio
import aiohttp
import time
import json

async def start_agent():
    agent_cmd = [
        'aca-py',
        'start',
        '--endpoint', 'http://localhost:8020',
        '--label', 'MyAgent',
        '--inbound-transport', 'http', '0.0.0.0', '8020',
        '--outbound-transport', 'http',
        '--admin', '0.0.0.0', '8031',
        '--admin-insecure-mode',
        '--wallet-type', 'indy',
        '--wallet-name', 'my_wallet',
        '--wallet-key', 'my_wallet_key',
        '--auto-provision',
        '--auto-accept-invites',
        '--auto-accept-requests'
    ]
    agent_process = subprocess.Popen(agent_cmd)
    time.sleep(5)
    return agent_process

async def create_invitation():
    admin_url = 'http://localhost:8031'
    async with aiohttp.ClientSession() as session:
        invite_endpoint = f'{admin_url}/connections/create-invitation'
        async with session.post(invite_endpoint) as response:
            invite = await response.json()
            print("Invitation Details:")
            print(json.dumps(invite, indent=2))
            return invite['invitation']

async def accept_invitation(invitation):
    admin_url = 'http://localhost:8041'
    async with aiohttp.ClientSession() as session:
        receive_endpoint = f'{admin_url}/connections/receive-invitation'
        async with session.post(receive_endpoint, json=invitation) as response:
            result = await response.json()
            print("Connection Response:")
            print(json.dumps(result, indent=2))

async def main():
    agent_process = await start_agent()

    try:
        invitation = await create_invitation()

        # Uncomment the following line if you have another agent to accept the invitation
        # await accept_invitation(invitation)

        print("Agent is running. Press Ctrl+C to exit.")
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("Shutting down agent...")
    finally:
        agent_process.terminate()
        agent_process.wait()

if __name__ == '__main__':
    asyncio.run(main())
