<script>
    let count = 0;
    function increment() {
      count += 1;
    }
  </script>
  
  <div class="counter">
    <p>The count is: {count}</p>
    <button on:click={increment}>Click me</button>
  </div>
  
  <style>
    .counter {
      background-color: #f0f4f8;
      border: 1px solid #e2e8f0;
      border-radius: 0.5rem;
      padding: 1rem;
      text-align: center;
    }
    button {
      background-color: #4f46e5;
      color: white;
      border: none;
      border-radius: 0.25rem;
      padding: 0.5rem 1rem;
      cursor: pointer;
    }
  </style>