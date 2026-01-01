"""
Mock Agent Test - Demonstrates how the frontend agent uses tools without LLM calls.

This shows the exact flow:
1. Agent runs background command (npm run dev)
2. Agent reads only last N lines (not full output) to save context
3. Agent can paginate if needed (limited to prevent abuse)
"""

import asyncio
from pathlib import Path
from bashtools import AsyncProcessExecutor

WORKSPACE = Path("/home/ab/fegg/frontend_agent/workspace")


class MockFrontendAgent:
    """
    Simulates the frontend agent's tool usage without LLM.
    Shows how the agent manages continuous commands like npm run dev.
    """

    def __init__(self, workspace: Path):
        self.executor = AsyncProcessExecutor(str(workspace), timeout=60)
        self.dev_server_cmd_id = None

    async def start_dev_server(self, command: str = "npm run dev") -> dict:
        """
        Tool: start_dev_server
        Starts dev server in background, returns immediately with initial output.
        """
        print(f"\n{'='*60}")
        print(f"[TOOL CALL] start_dev_server(command='{command}')")
        print(f"{'='*60}")

        result = await self.executor.run_background(command, wait_for_output=3.0)
        self.dev_server_cmd_id = result.get('cmd_id')

        print(f"\n[TOOL RESULT]")
        print(f"  cmd_id: {self.dev_server_cmd_id}")
        print(f"  status: {result.get('status')}")
        print(f"  url: {result.get('url', 'detecting...')}")
        print(f"  initial_output: {result.get('lines_captured', 0)} lines captured")

        return result

    async def check_dev_server(self, last_lines: int = 10) -> dict:
        """
        Tool: read_output (used by agent to check on dev server)
        Reads ONLY the last N lines - not full output!
        """
        print(f"\n{'='*60}")
        print(f"[TOOL CALL] read_output(cmd_id='{self.dev_server_cmd_id}', last_lines={last_lines})")
        print(f"{'='*60}")

        if not self.dev_server_cmd_id:
            return {"error": "No dev server started"}

        result = self.executor.read_log(self.dev_server_cmd_id, limit=last_lines, from_end=True)

        print(f"\n[TOOL RESULT]")
        print(f"  showing: {result.get('showing', 'N/A')}")
        print(f"  total_lines: {result.get('total_lines', 0)}")
        print(f"  is_running: {result.get('is_running', False)}")
        print(f"  pagination_remaining: {result.get('pagination_remaining', 0)}")
        print(f"\n  Output (last {last_lines} lines):")
        print("  " + "-" * 56)
        for line in result.get('lines', '').strip().split('\n'):
            print(f"  {line}")
        print("  " + "-" * 56)

        return result

    async def run_build(self, command: str = "npm run build") -> dict:
        """
        Tool: run_command (blocking)
        For commands that complete and exit (like build, install, lint).
        """
        print(f"\n{'='*60}")
        print(f"[TOOL CALL] run_command(command='{command}')")
        print(f"{'='*60}")

        result = await self.executor.run_command(command, timeout=60)

        print(f"\n[TOOL RESULT]")
        print(f"  cmd_id: {result.get('cmd_id')}")
        print(f"  exit_code: {result.get('exit_code')}")
        print(f"  status: {result.get('status')}")
        print(f"  total_lines: {result.get('total_lines', 0)}")
        print(f"\n  Output (truncated to last few lines):")
        print("  " + "-" * 56)
        for line in result.get('output', '').strip().split('\n')[-5:]:
            print(f"  {line}")
        print("  " + "-" * 56)

        return result

    async def stop_dev_server(self) -> dict:
        """
        Tool: stop_command
        Stops the running dev server.
        """
        print(f"\n{'='*60}")
        print(f"[TOOL CALL] stop_command(cmd_id='{self.dev_server_cmd_id}')")
        print(f"{'='*60}")

        if not self.dev_server_cmd_id:
            return {"error": "No dev server started"}

        result = await self.executor.terminate(self.dev_server_cmd_id)

        print(f"\n[TOOL RESULT]")
        print(f"  status: {result.get('status')}")
        print(f"  exit_code: {result.get('exit_code')}")

        return result


async def scenario_1_normal_flow():
    """
    Scenario 1: Normal agent flow
    - Start dev server
    - Check it a few times (reading only last N lines)
    - Stop it
    """
    print("\n" + "=" * 60)
    print("SCENARIO 1: Normal Agent Flow")
    print("=" * 60)

    agent = MockFrontendAgent(WORKSPACE)

    # Step 1: Start dev server
    await agent.start_dev_server()

    # Step 2: Let it run, check back (simulating agent continuing work)
    print("\n[AGENT] Continuing with other tasks...")
    await asyncio.sleep(2)

    # Step 3: Check server output (only last 5 lines!)
    await agent.check_dev_server(last_lines=5)

    # Step 4: Do more work, check again
    print("\n[AGENT] Doing more work...")
    await asyncio.sleep(2)
    await agent.check_dev_server(last_lines=5)

    # Step 5: Cleanup
    await agent.stop_dev_server()


async def scenario_2_context_saving():
    """
    Scenario 2: Demonstrate context window savings
    Show how much context is saved by reading only last N lines.
    """
    print("\n" + "=" * 60)
    print("SCENARIO 2: Context Window Savings Demonstration")
    print("=" * 60)

    agent = MockFrontendAgent(WORKSPACE)

    # Start dev server
    await agent.start_dev_server()

    # Let it generate output
    await asyncio.sleep(3)

    # Read log
    log = agent.executor.read_log(agent.dev_server_cmd_id, limit=10, from_end=True)
    total_lines = log.get('total_lines', 0)

    print("\n" + "=" * 60)
    print("CONTEXT SAVINGS ANALYSIS")
    print("=" * 60)
    print(f"Total output lines generated by server: {total_lines}")
    print(f"Lines agent actually reads: 10")
    print(f"Context saved: {max(0, total_lines - 10)} lines")
    print(f"\nIf each line = ~50 tokens:")
    print(f"  Without pagination: ~{total_lines * 50} tokens")
    print(f"  With pagination: ~{10 * 50} tokens")
    print(f"  Tokens saved: ~{max(0, total_lines - 10) * 50}")
    print("=" * 60)

    # Cleanup
    await agent.stop_dev_server()


async def scenario_3_pagination_limit():
    """
    Scenario 3: Demonstrate pagination limit
    Agent can only paginate 3 times per command (prevents infinite loops).
    """
    print("\n" + "=" * 60)
    print("SCENARIO 3: Pagination Limit (3 calls max)")
    print("=" * 60)

    agent = MockFrontendAgent(WORKSPACE)

    # Start dev server
    await agent.start_dev_server()

    # Try to paginate 5 times (should fail after 3)
    for i in range(5):
        print(f"\n[AGENT] Pagination attempt #{i + 1}")
        result = await agent.check_dev_server(last_lines=3)
        if "error" in result:
            print(f"\n[AGENT] Got pagination limit error as expected!")
            break

    # Cleanup
    await agent.stop_dev_server()


async def scenario_4_build_then_dev():
    """
    Scenario 4: Typical workflow - build (fails) then dev (works anyway)
    """
    print("\n" + "=" * 60)
    print("SCENARIO 4: Build (with errors) -> Dev Server (works anyway)")
    print("=" * 60)

    agent = MockFrontendAgent(WORKSPACE)

    # Try to build (will fail with TS errors)
    print("\n[AGENT] Attempting to build...")
    build_result = await agent.run_build()

    if build_result.get('exit_code', 0) != 0:
        print("\n[AGENT] Build failed, but dev server should still work!")
        print("[AGENT] Vite dev mode ignores TypeScript errors")

    # Start dev server anyway
    await agent.start_dev_server()

    # Check it's working
    await asyncio.sleep(2)
    await agent.check_dev_server(last_lines=5)

    # Cleanup
    await agent.stop_dev_server()


async def main():
    """Run all scenarios."""
    print("\n" + "=" * 60)
    print("Mock Frontend Agent - Tool Usage Demonstration")
    print("=" * 60)
    print(f"Workspace: {WORKSPACE}")

    if not WORKSPACE.exists():
        print(f"\nERROR: Workspace not found at {WORKSPACE}")
        return

    await scenario_1_normal_flow()
    await scenario_2_context_saving()
    await scenario_3_pagination_limit()
    await scenario_4_build_then_dev()

    print("\n" + "=" * 60)
    print("All scenarios complete!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
