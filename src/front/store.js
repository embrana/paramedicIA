export const initialStore=()=>{
  return{
    message: null,
    chatMessages: [],
    isLoading: false,
    todos: [
      {
        id: 1,
        title: "Make the bed",
        background: null,
      },
      {
        id: 2,
        title: "Do my homework",
        background: null,
      }
    ]
  }
}

export default function storeReducer(store, action = {}) {
  switch(action.type){
    case 'set_hello':
      return {
        ...store,
        message: action.payload
      };
      
    case 'add_task':
      const { id, color } = action.payload;
      return {
        ...store,
        todos: store.todos.map((todo) => (todo.id === id ? { ...todo, background: color } : todo))
      };
      
    case 'add_message':
      return {
        ...store,
        chatMessages: [...store.chatMessages, action.payload]
      };
      
    case 'set_loading':
      return {
        ...store,
        isLoading: action.payload
      };
      
    case 'clear_chat':
      return {
        ...store,
        chatMessages: []
      };
      
    default:
      throw Error('Unknown action.');
  }    
}
