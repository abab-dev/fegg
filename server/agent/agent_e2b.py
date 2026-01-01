"""
Frontend Agent with E2B Sandbox Backend

Same agent logic, but runs in E2B sandbox instead of local filesystem.
Uses FileBackend abstraction for seamless switching.
"""

import os
import json
import time
from typing import Literal, Any, Dict, Optional
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
from langchain_core.tools import StructuredTool
from langgraph.graph import StateGraph, START, END, MessagesState
from pydantic import BaseModel, Field

from server.sandbox.sandbox import SandboxManager, UserSandbox
from server.sandbox.backends import E2BBackend, FileBackend
from server.tools.backend_tools import FSTools
from server.agent.prompts import get_e2b_agent_prompt

load_dotenv()

ZAI_MODEL_NAME = os.getenv("ZAI_MODEL_NAME", "GLM-4.5-air")
ZAI_BASE_URL = os.getenv("ZAI_BASE_URL")
ZAI_API_KEY = os.getenv("ZAI_API_KEY")

MAX_ITERATIONS = 100


class Logger:
    HEADER = "\033[95m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    ENDC = "\033[0m"
    BOLD = "\033[1m"

    @staticmethod
    def log_agent(content: str):
        print(f"\n{Logger.BLUE}{Logger.BOLD}[Agent]:{Logger.ENDC} {content}", flush=True)

    @staticmethod
    def log_tool_call(tool_name: str, args: Dict):
        args_display = {}
        for k, v in args.items():
            if isinstance(v, str) and len(v) > 200:
                args_display[k] = v[:200] + "..."
            else:
                args_display[k] = v
        args_str = json.dumps(args_display, indent=2)
        print(f"\n{Logger.YELLOW}>>> {tool_name}{Logger.ENDC}", flush=True)
        print(f"{Logger.YELLOW}{args_str}{Logger.ENDC}", flush=True)

    @staticmethod
    def log_tool_result(tool_name: str, result: str):
        display = result[:300] + "..." if len(result) > 300 else result
        print(f"{Logger.GREEN}<<< {tool_name}: {display}{Logger.ENDC}", flush=True)

    @staticmethod
    def log_system(msg: str):
        print(f"{Logger.CYAN}[System] {msg}{Logger.ENDC}", flush=True)


def create_tools(tools: FSTools, sandbox: UserSandbox):
    """Create LangChain tools from FSTools + sandbox."""

    class ReadFileInput(BaseModel):
        path: str = Field(description="Path to file (relative to workspace)")
    
    def read_file(path: str) -> str:
        """Read contents of a file."""
        return tools.read_file(path)
    
    class WriteFileInput(BaseModel):
        path: str = Field(description="Path to file (relative to workspace)")
        content: str = Field(description="Content to write")
    
    def write_file(path: str, content: str) -> str:
        """Write content to a file. Creates parent directories."""
        return tools.write_file(path, content)
    
    class ListFilesInput(BaseModel):
        path: str = Field(default=".", description="Directory to list")
    
    def list_files(path: str = ".") -> str:
        """List files in directory."""
        return tools.list_dir(path)
    
    class GrepInput(BaseModel):
        pattern: str = Field(description="Pattern to search for")
        path: str = Field(default=".", description="Path to search in")
    
    def grep_search(pattern: str, path: str = ".") -> str:
        """Search for pattern in files."""
        return tools.grep(pattern, path)
    
    class FuzzyFindInput(BaseModel):
        query: str = Field(description="Partial filename to search for")
    
    def fuzzy_find(query: str) -> str:
        """Fuzzy search for files by name."""
        return tools.fuzzy_find(query)

    class RunCommandInput(BaseModel):
        command: str = Field(description="Command to run (e.g., 'bun run build')")
        timeout: int = Field(default=60, description="Max seconds to wait")
    
    def run_command(command: str, timeout: int = 60) -> str:
        """
        Run a shell command that terminates.
        Use for: bun run build, bun install, etc.
        DO NOT use for dev servers.
        """
        result = sandbox.sandbox.commands.run(
            f"cd {sandbox.workspace_path} && {command}",
            timeout=timeout
        )
        output = result.stdout or ""
        if result.stderr:
            output += f"\n[stderr]: {result.stderr}"
        return output
    
    class StartDevServerInput(BaseModel):
        command: str = Field(default="bun run dev", description="Dev server command")
    
    def start_dev_server(command: str = "bun run dev") -> str:
        """
        Start dev server in background. Waits for server to be ready.
        Returns preview URL when server is responding.
        """
        try:
            sandbox.sandbox.commands.run("pkill -f 'vite' 2>/dev/null; exit 0", timeout=5)
        except:
            pass
        time.sleep(1)

        try:
            sandbox.sandbox.commands.run(
                command,
                background=True,
                cwd=sandbox.workspace_path
            )
        except Exception as e:
            pass

        sandbox.dev_server_running = True

        code = "000"
        max_wait = 10
        for i in range(max_wait):
            time.sleep(1)
            try:
                result = sandbox.sandbox.commands.run(
                    "curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/ 2>/dev/null || echo '000'",
                    timeout=5
                )
                code = result.stdout.strip()
                if code == "200":
                    break
            except:
                pass

        try:
            host = sandbox.sandbox.get_host(5173)
            url = f"https://{host}"
            sandbox.preview_url = url
            
            if code == "200":
                return f"✓ Dev server running.\nPreview URL: {url}"
            else:
                return f"Dev server starting...\nPreview URL: {url}"
        except Exception as e:
            return f"Dev server started but couldn't get URL: {e}"

    def get_preview_url() -> str:
        """Get the public preview URL for the running dev server."""
        if sandbox.preview_url:
            return sandbox.preview_url
        try:
            host = sandbox.sandbox.get_host(5173)
            url = f"https://{host}"
            sandbox.preview_url = url
            return url
        except:
            return "No preview URL available. Start dev server first."

    def check_dev_server() -> str:
        """Check if dev server is running and get recent logs."""
        result = sandbox.sandbox.commands.run(
            "curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/ 2>/dev/null || echo '000'",
            timeout=5
        )
        http_code = result.stdout.strip()

        logs = sandbox.sandbox.commands.run(
            "tail -20 /tmp/dev-server.log 2>/dev/null || echo 'No logs'",
            timeout=5
        )

        status = "✓ Running" if http_code == "200" else f"⚠ HTTP {http_code}"
        url = sandbox.preview_url or "Not available"

        return f"Status: {status}\nPreview URL: {url}\n\nRecent logs:\n{logs.stdout}"

    class ShowUserMessageInput(BaseModel):
        message: str = Field(description="Message to show to the user")
    
    def show_user_message(message: str) -> str:
        """
        Send a message to the user. Use this tool to communicate:
        - What you've done (summary of changes)
        - What to do next
        - Any important information
        
        This is the ONLY way to communicate with the user. Regular text responses are not shown.
        Always use this tool at the end of your work to inform the user.
        """
        return message

    wrapped = [
        StructuredTool.from_function(read_file, args_schema=ReadFileInput),
        StructuredTool.from_function(write_file, args_schema=WriteFileInput),
        StructuredTool.from_function(list_files, args_schema=ListFilesInput),
        StructuredTool.from_function(grep_search, args_schema=GrepInput),
        StructuredTool.from_function(fuzzy_find, args_schema=FuzzyFindInput),
        StructuredTool.from_function(run_command, args_schema=RunCommandInput),
        StructuredTool.from_function(start_dev_server, args_schema=StartDevServerInput),
        StructuredTool.from_function(get_preview_url),
        StructuredTool.from_function(check_dev_server),
        StructuredTool.from_function(show_user_message, args_schema=ShowUserMessageInput),
    ]

    return wrapped


def get_llm():
    return ChatOpenAI(
        model=ZAI_MODEL_NAME,
        base_url=ZAI_BASE_URL,
        api_key=ZAI_API_KEY,
        temperature=0.1,
    )


def create_agent_node(system_prompt: str, tools: list):
    """Create the main agent node."""

    llm = get_llm()
    llm_bound = llm.bind_tools(tools)
    tool_map = {t.name: t for t in tools}
    
    def agent_node(state: MessagesState):
        messages = state["messages"]
        prompt = [SystemMessage(content=system_prompt)] + messages
        response = llm_bound.invoke(prompt)
        
        if response.content:
            Logger.log_agent(response.content)
        
        return {"messages": [response]}
    
    def tool_executor(state: MessagesState) -> Dict[str, Any]:
        """Execute tools called by agent."""
        messages = state["messages"]
        last_message = messages[-1]
        
        if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
            return {"messages": []}
        
        results = []
        for tool_call in last_message.tool_calls:
            name = tool_call["name"]
            args = tool_call["args"]
            tool_id = tool_call["id"]
            
            if name.endswith("()"):
                name = name[:-2]
            
            Logger.log_tool_call(name, args)
            
            if name in tool_map:
                try:
                    output = tool_map[name].invoke(args)
                except Exception as e:
                    output = f"Error: {e}"
            else:
                output = f"Unknown tool: {name}"
            
            Logger.log_tool_result(name, str(output)[:200])
            results.append(ToolMessage(content=str(output), tool_call_id=tool_id))
        
        return {"messages": results}

    def router(state: MessagesState) -> Literal["tools", END]:
        last = state["messages"][-1]
        if isinstance(last, AIMessage) and last.tool_calls:
            return "tools"
        return END
    
    return agent_node, tool_executor, router


def build_graph(user_sandbox: UserSandbox):
    """Build the LangGraph for frontend agent with E2B backend."""

    backend = E2BBackend(user_sandbox.sandbox, user_sandbox.workspace_path)
    fs_tools = FSTools(backend)

    system_prompt = get_e2b_agent_prompt(user_sandbox.workspace_path)

    tools = create_tools(fs_tools, user_sandbox)

    agent_node, tool_executor, router = create_agent_node(system_prompt, tools)

    builder = StateGraph(MessagesState)
    builder.add_node("agent", agent_node)
    builder.add_node("tools", tool_executor)
    builder.add_edge(START, "agent")
    builder.add_conditional_edges("agent", router, {"tools": "tools", END: END})
    builder.add_edge("tools", "agent")
    
    return builder.compile()


def run_agent(user_id: str, query: str):
    """Run the frontend agent in E2B sandbox."""

    Logger.log_system("Creating E2B sandbox...")
    manager = SandboxManager()
    user_sandbox = manager.create(user_id)
    Logger.log_system(f"Sandbox ready: {user_sandbox.sandbox_id}")
    Logger.log_system(f"Workspace: {user_sandbox.workspace_path}")

    try:
        graph = build_graph(user_sandbox)

        config = {"recursion_limit": MAX_ITERATIONS}
        
        print(f"\n{Logger.HEADER}{'=' * 50}{Logger.ENDC}", flush=True)
        print(f"{Logger.BOLD}Query:{Logger.ENDC} {query}", flush=True)
        print(f"{Logger.HEADER}{'=' * 50}{Logger.ENDC}", flush=True)
        
        final_state = graph.invoke(
            {"messages": [HumanMessage(content=query)]}, 
            config=config
        )

        if user_sandbox.preview_url:
            print(f"\n{Logger.GREEN}Preview URL: {user_sandbox.preview_url}{Logger.ENDC}")
        
        print(f"\n{Logger.HEADER}=== Done ==={Logger.ENDC}", flush=True)
        return final_state, user_sandbox
        
    except Exception as e:
        print(f"\n{Logger.RED}Error: {e}{Logger.ENDC}", flush=True)
        import traceback
        traceback.print_exc()
        return None, user_sandbox

    finally:
        pass


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Frontend Agent (E2B)")
    parser.add_argument("--user", "-u", type=str, default="test-user", help="User ID")
    parser.add_argument("--query", "-q", type=str, help="Task query")
    
    args = parser.parse_args()
    
    print(f"{Logger.HEADER}=== Frontend Agent (E2B) ==={Logger.ENDC}")
    print(f"Model: {ZAI_MODEL_NAME}")
    print(f"User: {args.user}")
    
    query = args.query or "Create a beautiful landing page for TaskFlow - a project management SaaS."
    
    result, sandbox = run_agent(args.user, query)
    
    # Keep sandbox alive for inspection
    if sandbox and sandbox.preview_url:
        print(f"\n{Logger.CYAN}Sandbox still running. Preview: {sandbox.preview_url}{Logger.ENDC}")
        input("Press Enter to destroy sandbox...")
    
    # Cleanup
    if sandbox:
        SandboxManager().destroy(args.user)
        Logger.log_system("Sandbox destroyed.")
