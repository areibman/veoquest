from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple, Iterable, Set

# -------- Core types --------

class SceneType(str, Enum):
    ROOT = "root"          # Single entry point
    CHOICE = "choice"      # Pauses gameplay; no video generated
    EXTENSION = "extension"# Continues last video; can have prompt or not
    END = "end"            # Terminal node

SceneId = str

@dataclass
class Edge:
    """Directed edge to another scene. 'label' shows up on CHOICE scenes."""
    target: SceneId
    label: Optional[str] = None  # Required for CHOICE scenes; ignored otherwise

@dataclass
class Scene:
    id: SceneId
    kind: SceneType
    name: Optional[str] = None
    # For CHOICE, outgoing edges must have labels.
    # For EXTENSION/ROOT, you can have a single implicit continuation or branches.
    # For END, there must be no edges.
    edges: List[Edge] = field(default_factory=list)

    # --- EXTENSION-only payload ---
    # You generate at most 8s clips; chain more by setting segments > 1.
    segments: int = 1                    # Number of 8s clips to stitch
    duration_per_segment_sec: int = 8    # Usually fixed at 8
    # Prompt handling:
    # - If prompt is not None, use it verbatim
    # - If prompt is None and inherit_prompt=True, use last choice label
    prompt: Optional[str] = None
    inherit_prompt: bool = True

    # Optional metadata for production
    notes: Optional[str] = None

@dataclass
class SceneGraph:
    """A scene graph indexed by scene id."""
    nodes: Dict[SceneId, Scene]

    def root(self) -> Scene:
        roots = [s for s in self.nodes.values() if s.kind == SceneType.ROOT]
        if len(roots) != 1:
            raise ValueError(f"Graph must have exactly one root, found {len(roots)}.")
        return roots[0]

    # ---- Validation rules based on your spec ----
    def validate(self) -> None:
        r = self.root()

        for s in self.nodes.values():
            if s.kind == SceneType.CHOICE:
                if not s.edges:
                    raise ValueError(f"CHOICE '{s.id}' must have at least one option.")
                if any(e.label is None for e in s.edges):
                    raise ValueError(f"CHOICE '{s.id}' edges must have labels.")
            elif s.kind == SceneType.END:
                if s.edges:
                    raise ValueError(f"END '{s.id}' must not have outgoing edges.")
            # EXTENSION/ROOT can have 0..n edges

        # Basic reachability: all nodes should be reachable from root
        reachable = set(self._dfs_ids(r.id))
        unreachable = set(self.nodes.keys()) - reachable
        if unreachable:
            raise ValueError(f"Unreachable scenes: {sorted(unreachable)}")

    def _dfs_ids(self, start: SceneId) -> Iterable[SceneId]:
        seen: Set[SceneId] = set()
        stack = [start]
        while stack:
            sid = stack.pop()
            if sid in seen: 
                continue
            seen.add(sid)
            for e in self.nodes[sid].edges:
                stack.append(e.target)
        return seen

    # ---- Utilities ----

    def enumerate_paths(self) -> List[List[Tuple[Scene, Optional[str]]]]:
        """
        Returns all root->end paths.
        Each step is (Scene, choice_label_taken_on_incoming_edge).
        """
        start = self.root()
        out: List[List[Tuple[Scene, Optional[str]]]] = []

        def walk(cur: Scene, path: List[Tuple[Scene, Optional[str]]]):
            if cur.kind == SceneType.END or not cur.edges:
                out.append(path + [(cur, None)])
                return
            for e in cur.edges:
                nxt = self.nodes[e.target]
                walk(nxt, path + [(cur, e.label)])

        walk(start, [])
        return out

    def total_render_time_sec(self, path: List[Tuple[Scene, Optional[str]]]) -> int:
        """Sum of all extension (and root-if-extension-like) video time along a path."""
        total = 0
        for scene, _ in path:
            if scene.kind in (SceneType.ROOT, SceneType.EXTENSION):
                total += scene.segments * scene.duration_per_segment_sec
        return total

    def pretty_print(self) -> None:
        """ASCII tree from the unique root."""
        def show(node: Scene, indent: str = ""):
            head = f"{node.kind.value.upper()}: {node.name or node.id}"
            if node.kind in (SceneType.ROOT, SceneType.EXTENSION):
                head += f"  [segments={node.segments} x {node.duration_per_segment_sec}s, " \
                        f"prompt={'\"'+node.prompt+'\"' if node.prompt is not None else ('inherit' if node.inherit_prompt else 'none')}]"
            print(indent + head)
            if not node.edges:
                return
            for i, e in enumerate(node.edges):
                last = (i == len(node.edges) - 1)
                branch = "└─" if last else "├─"
                label = f" ({e.label})" if e.label else ""
                print(indent + f"{branch}→ {e.target}{label}")
                show(self.nodes[e.target], indent + ("   " if last else "│  "))
        show(self.root())

# -------- Example graph matching your scenario --------
# Flow:
# Root -> (ext) Enter dungeon (2 clips) -> Choice (Lockpick/Bash)
#   Lockpick -> (ext) Opening door (1 clip) -> End
#   Bash     -> (ext) Smashing door (1 clip) -> End

graph = SceneGraph(
    nodes={
        "root": Scene(
            id="root",
            kind=SceneType.ROOT,
            name="Game Start",
            segments=2,  # two 8s clips stitched (entering dungeon)
            prompt="entering the dungeon with torchlight flicker",
            inherit_prompt=False,
            edges=[Edge(target="door_choice")]
        ),
        "door_choice": Scene(
            id="door_choice",
            kind=SceneType.CHOICE,
            name="At the locked door",
            edges=[
                Edge(target="lockpick_ext", label="Lockpick door"),
                Edge(target="bash_ext", label="Bash door open"),
            ],
        ),
        "lockpick_ext": Scene(
            id="lockpick_ext",
            kind=SceneType.EXTENSION,
            name="Lockpicking",
            segments=1,                  # one 8s extension
            prompt=None,                 # no explicit prompt → inherit last choice label
            inherit_prompt=True,
            edges=[Edge(target="end")]
        ),
        "bash_ext": Scene(
            id="bash_ext",
            kind=SceneType.EXTENSION,
            name="Bashing",
            segments=1,
            prompt=None,                 # inherit last choice label ("Bash door open")
            inherit_prompt=True,
            edges=[Edge(target="end")]
        ),
        "end": Scene(
            id="end",
            kind=SceneType.END,
            name="The Door Opens"
        ),
    }
)

if __name__ == "__main__":
    graph.validate()
    graph.pretty_print()

    # Get all playable routes and their total render time
    paths = graph.enumerate_paths()
    for i, p in enumerate(paths, 1):
        seconds = graph.total_render_time_sec(p)
        route = " -> ".join(f"{s.id}" + (f"[{lbl}]" if lbl else "") for s, lbl in p)
        print(f"\nRoute {i}: {route}\nTotal video time: {seconds}s")