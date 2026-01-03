
import asyncio
import sys
from pathlib import Path
from bashtools import AsyncProcessExecutor

WORKSPACE = Path("/home/ab/fegg/frontend_agent/workspace")


async def test_blocking_command():
    print("=" * 60)
    print("TEST 1: Blocking command (npm run build)")
    print("=" * 60)

    executor = AsyncProcessExecutor(str(WORKSPACE), timeout=60)

    result = await executor.run_command("npm run build", timeout=30)

    print(f"\nResult:")
    print(f"  cmd_id: {result.get('cmd_id')}")
    print(f"  exit_code: {result.get('exit_code')}")
    print(f"  status: {result.get('status')}")
    print(f"  total_lines: {result.get('total_lines', 0)}")
    print(f"\nOutput (truncated to last few lines):")
    print("-" * 40)
    print(result.get('output', 'No output'))
    print("-" * 40)


async def test_background_command():
    print("\n" + "=" * 60)
    print("TEST 2: Background command (npm run dev)")
    print("=" * 60)

    executor = AsyncProcessExecutor(str(WORKSPACE), timeout=60)

    print("\n1. Starting dev server in background...")
    result = await executor.run_background("npm run dev", wait_for_output=3.0)

    print(f"\n2. Start result:")
    print(f"  cmd_id: {result.get('cmd_id')}")
    print(f"  status: {result.get('status')}")
    print(f"  url: {result.get('url', 'N/A')}")
    print(f"  lines_captured: {result.get('lines_captured', 0)}")

    cmd_id = result.get('cmd_id')

    print(f"\n3. Initial output (first {result.get('lines_captured', 0)} lines):")
    print("-" * 40)
    print(result.get('initial_output', 'No output'))
    print("-" * 40)

    print(f"\n4. Agent checks back later - reading only LAST 5 lines:")
    print("(This avoids polluting context window with full output)")
    log_result = executor.read_log(cmd_id, limit=5, from_end=True)

    print(f"\n5. Paginated log result:")
    print(f"  showing: {log_result.get('showing', 'N/A')}")
    print(f"  total_lines: {log_result.get('total_lines', 0)}")
    print(f"  is_running: {log_result.get('is_running', False)}")
    print(f"  pagination_remaining: {log_result.get('pagination_remaining', 0)}")

    print(f"\n6. Last 5 lines of output:")
    print("-" * 40)
    print(log_result.get('lines', 'No output'))
    print("-" * 40)

    print(f"\n7. Recent commands:")
    for cmd in executor.list_commands(limit=3):
        print(f"  - {cmd['cmd_id']}: {cmd['command']} (exit_code={cmd.get('exit_code')}, running={cmd.get('is_running')})")

    print(f"\n8. Stopping dev server...")
    stop_result = await executor.terminate(cmd_id)
    print(f"  status: {stop_result.get('status')}")
    print(f"  exit_code: {stop_result.get('exit_code')}")


async def test_context_window_simulation():
    print("\n" + "=" * 60)
    print("TEST 3: Context Window Simulation")
    print("=" * 60)

    executor = AsyncProcessExecutor(str(WORKSPACE), timeout=60)

    print("\n1. Starting dev server...")
    result = await executor.run_background("npm run dev", wait_for_output=2.0)
    cmd_id = result.get('cmd_id')

    print(f"\n2. Let server run for a moment...")
    await asyncio.sleep(2)

    print(f"\n3. Simulating agent reading output multiple times:")
    print("   (Each read only gets last N lines, not full history)")

    for i in range(3):
        log = executor.read_log(cmd_id, limit=3, from_end=True)
        print(f"\n   Read #{i+1}: {log.get('showing', 'N/A')}")
        for line in log.get('lines', '').strip().split('\n')[-3:]:
            if line.strip():
                print(f"     {line.strip()}")
        await asyncio.sleep(1)

    log = executor.read_log(cmd_id, limit=3, from_end=True)
    total = log.get('total_lines', 0)
    print(f"\n4. Summary:")
    print(f"   Total output lines generated: {total}")
    print(f"   Lines agent actually reads each time: 3")
    print(f"   Context saved: ~{total - 3} lines per read!")
    print(f"   Pagination remaining: {log.get('pagination_remaining', 0)}")

    # Cleanup
    await executor.terminate(cmd_id)
    print(f"\n5. Server stopped.")


async def test_noisy_command_suppression():
    print("\n" + "=" * 60)
    print("TEST 4: Noisy Command Suppression")
    print("=" * 60)

    executor = AsyncProcessExecutor(str(WORKSPACE), timeout=60)

    print("\n1. Running npm install (a 'noisy' command)...")
    result = await executor.run_command("npm install --no-save", timeout=30)

    print(f"\n2. Result (output should be suppressed on success):")
    print(f"  exit_code: {result.get('exit_code')}")
    print(f"  total_lines: {result.get('total_lines', 0)}")
    print(f"\n3. Output:")
    print("-" * 40)
    print(result.get('output', 'No output'))
    print("-" * 40)


async def main():
    print("\n" + "=" * 60)
    print("AsyncProcessExecutor Isolation Test")
    print("=" * 60)
    print(f"Workspace: {WORKSPACE}")

    if not WORKSPACE.exists():
        print(f"\nERROR: Workspace not found at {WORKSPACE}")
        return

    await test_blocking_command()
    await test_background_command()
    await test_context_window_simulation()
    await test_noisy_command_suppression()

    print("\n" + "=" * 60)
    print("All tests complete!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
