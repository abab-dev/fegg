"""
Frontend Agent - Lovable-like frontend builder
Single-agent LangGraph implementation with RepoMind tools.
"""

import os
import shutil
import json
import asyncio
from pathlib import Path
from typing import Literal, Any, Dict
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
from langchain_core.tools import StructuredTool
from langgraph.graph import StateGraph, START, END, MessagesState

from repomind.client import RepoMind
from bashtools import AsyncProcessExecutor
from frontend_agent.prompts import get_frontend_agent_prompt

load_dotenv()

# ============================================================================
# CONFIGURATION
# ============================================================================

# Paths
TEMPLATE_PATH = Path(__file__).parent / "template" / "react-vite-shadcn-ui"
WORKSPACE_PATH = Path(__file__).parent / "workspace"

# ZAI API (same as debug_agent_graph)
ZAI_MODEL_NAME = os.getenv("ZAI_MODEL_NAME", "GLM-4.5-air")
ZAI_BASE_URL = os.getenv("ZAI_BASE_URL")
ZAI_API_KEY = os.getenv("ZAI_API_KEY")

MAX_ITERATIONS = 50


# ============================================================================
# LOGGING
# ============================================================================


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
        print(f"\n{Logger.BLUE}{Logger.BOLD}[Agent]:{Logger.ENDC} {content}")

    @staticmethod
    def log_tool_call(tool_name: str, args: Dict):
        # Truncate long args
        args_display = {}
        for k, v in args.items():
            if isinstance(v, str) and len(v) > 200:
                args_display[k] = v[:200] + "..."
            else:
                args_display[k] = v
        args_str = json.dumps(args_display, indent=2)
        print(f"\n{Logger.YELLOW}>>> {tool_name}{Logger.ENDC}")
        print(f"{Logger.YELLOW}{args_str}{Logger.ENDC}")

    @staticmethod
    def log_tool_result(tool_name: str, result: str):
        display = result[:300] + "..." if len(result) > 300 else result
        print(f"{Logger.GREEN}<<< {tool_name}: {display}{Logger.ENDC}")

    @staticmethod
    def log_system(msg: str):
        print(f"{Logger.CYAN}[System] {msg}{Logger.ENDC}")


# ============================================================================
# WORKSPACE MANAGEMENT
# ============================================================================


def init_workspace(force: bool = False) -> Path:
    """
    Initialize workspace by copying template.
    Returns the workspace path.
    """
    if WORKSPACE_PATH.exists():
        if force:
            Logger.log_system(f"Removing existing workspace...")
            shutil.rmtree(WORKSPACE_PATH)
        else:
            Logger.log_system(f"Using existing workspace: {WORKSPACE_PATH}")
            return WORKSPACE_PATH

    Logger.log_system(f"Creating workspace from template...")
    shutil.copytree(TEMPLATE_PATH, WORKSPACE_PATH, symlinks=True)
    Logger.log_system(f"Workspace ready: {WORKSPACE_PATH}")
    return WORKSPACE_PATH


# ============================================================================
# TOOLS SETUP
# ============================================================================


def create_tools(workspace: Path):
    """Create tools for the frontend agent."""
    
    # Initialize RepoMind for the workspace
    rm = RepoMind(str(workspace))
    
    # Bash executor for npm commands
    bash = AsyncProcessExecutor(str(workspace), timeout=120)
    
    # Tool 1: Blocking command for terminating commands (build, install, lint)
    def run_command(command: str, timeout: int = 60) -> dict:
        """
        Run a shell command that terminates (completes and exits).
        
        Use for: npm run build, npm install, npm run lint, etc.
        DO NOT use for: npm run dev (use start_dev_server instead).
        
        Args:
            command: The command to run (e.g., "npm run build")
            timeout: Max seconds to wait (default 60)
            
        Returns:
            dict with exit_code, output, and status
        """
        try:
            result = asyncio.run(bash.run_command(command, timeout=timeout))
            return result
        except Exception as e:
            return {"error": str(e)}
    
    # Tool 2: Non-blocking for dev servers
    def start_dev_server(command: str = "npm run dev") -> dict:
        """
        Start a development server in the background.
        
        Returns immediately after server starts. Automatically kills previous dev server.
        
        Args:
            command: Dev server command (default: "npm run dev")
            
        Returns:
            dict with cmd_id, status, url (if detected), and initial output
        """
        try:
            result = asyncio.run(bash.run_background(command, wait_for_output=3.0))
            return result
        except Exception as e:
            return {"error": str(e)}
    
    # Tool 3: Read output from running/completed command
    def read_output(cmd_id: str, last_lines: int = 50) -> dict:
        """
        Read recent output from a command (running or completed).
        
        Args:
            cmd_id: Command ID from run_command or start_dev_server
            last_lines: Number of lines to read from end (default 50)
            
        Returns:
            dict with lines, is_running status, and total_lines
        """
        try:
            result = bash.read_log(cmd_id, limit=last_lines, from_end=True)
            return result
        except Exception as e:
            return {"error": str(e)}
    
    # Tool 4: Stop a running command
    def stop_command(cmd_id: str) -> dict:
        """
        Stop a running background command (e.g., dev server).
        
        Args:
            cmd_id: Command ID from start_dev_server
            
        Returns:
            dict with status and exit_code
        """
        try:
            result = asyncio.run(bash.terminate(cmd_id))
            return result
        except Exception as e:
            return {"error": str(e)}
    
    # Core tools
    tools = [
        rm.fs.read_file,
        rm.fs.write_file,
        rm.fs.list_files,
        rm.search.glob_search,
        rm.search.grep_string,
        rm.edit.apply_file_edit,
    ]
    
    # Wrap all tools
    wrapped_tools = [StructuredTool.from_function(t) for t in tools]
    
    # Add bash tools
    wrapped_tools.append(StructuredTool.from_function(run_command))
    wrapped_tools.append(StructuredTool.from_function(start_dev_server))
    wrapped_tools.append(StructuredTool.from_function(read_output))
    wrapped_tools.append(StructuredTool.from_function(stop_command))
    
    return wrapped_tools, bash  # Return bash for cleanup


# ============================================================================
# LLM
# ============================================================================


def get_llm():
    return ChatOpenAI(
        model=ZAI_MODEL_NAME,
        base_url=ZAI_BASE_URL,
        api_key=ZAI_API_KEY,
        temperature=0.1,  # Slightly creative for design
    )


# ============================================================================
# AGENT NODE
# ============================================================================


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


# ============================================================================
# BUILD GRAPH
# ============================================================================


def build_graph(workspace: Path):
    """Build the LangGraph for frontend agent."""
    
    # Get workspace root as string
    workspace_root = str(workspace.resolve())
    
    # Create prompt and tools
    system_prompt = get_frontend_agent_prompt(workspace_root)
    tools, bash_executor = create_tools(workspace)
    
    # Create nodes
    agent_node, tool_executor, router = create_agent_node(system_prompt, tools)
    
    # Build graph
    builder = StateGraph(MessagesState)
    
    builder.add_node("agent", agent_node)
    builder.add_node("tools", tool_executor)
    
    builder.add_edge(START, "agent")
    builder.add_conditional_edges("agent", router, {"tools": "tools", END: END})
    builder.add_edge("tools", "agent")
    
    return builder.compile(), bash_executor


# ============================================================================
# MAIN
# ============================================================================


def run_agent(query: str, reset_workspace: bool = False):
    """Run the frontend agent with a query."""
    
    # Initialize workspace
    workspace = init_workspace(force=reset_workspace)
    
    # Build graph
    graph, bash_executor = build_graph(workspace)
    
    # Run
    config = {"recursion_limit": MAX_ITERATIONS}
    
    print(f"\n{Logger.HEADER}{'='*50}{Logger.ENDC}")
    print(f"{Logger.BOLD}Query:{Logger.ENDC} {query}")
    print(f"{Logger.HEADER}{'='*50}{Logger.ENDC}")
    
    try:
        final_state = graph.invoke(
            {"messages": [HumanMessage(content=query)]},
            config=config
        )
        print(f"\n{Logger.HEADER}=== Done ==={Logger.ENDC}")
        return final_state
    except Exception as e:
        print(f"\n{Logger.RED}Error: {e}{Logger.ENDC}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        # Cleanup: terminate any running background processes
        try:
            cleanup_result = asyncio.run(bash_executor.cleanup_all())
            if cleanup_result.get("terminated_count", 0) > 0:
                Logger.log_system(f"Cleaned up {cleanup_result['terminated_count']} background process(es)")
        except Exception:
            pass  # Best effort cleanup


if __name__ == "__main__":
    print(f"{Logger.HEADER}=== Frontend Agent ==={Logger.ENDC}")
    print(f"Template: {TEMPLATE_PATH}")
    print(f"Workspace: {WORKSPACE_PATH}")
    print(f"Model: {ZAI_MODEL_NAME}")
    
    # Check if user wants to reset
    reset = input("Reset workspace? (y/N): ").lower() == "y"
    
    # Get query
    default_query = "Create a beautiful landing page for a SaaS product called 'TaskFlow' - a project management tool."
    query = input(f"\nQuery (default: '{default_query[:50]}...'): ") or default_query
    
    run_agent(query, reset_workspace=reset)
